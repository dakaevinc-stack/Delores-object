using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Extensions;
using ACadSharp.IO;
using CSMath;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using System.Text.Json;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: Dwg2Png <input.dwg> <output.png> [width=4096]");
    Environment.Exit(2);
}

string input = args[0];
string output = args[1];
int width = args.Length > 2 && int.TryParse(args[2], out var w) ? w : 4096;

var strategies = new (bool explode, bool flattenBulges, int renderWidth, bool dxfRoundtrip)[]
{
    (true, false, width, false),
    (true, true, width, false),
    (false, true, Math.Min(width, 10240), false),
    (true, true, Math.Min(width, 10240), true),
};

Exception? last = null;
foreach (var (explode, flattenBulges, tryWidth, dxfRoundtrip) in strategies)
{
    try
    {
        var doc = ReadDocument(input);
        if (explode) ExplodeInserts(doc);
        if (flattenBulges) FlattenBulges(doc);
        RemoveInvalidArcs(doc);
        RemoveSpatialOutliers(doc);

        if (dxfRoundtrip)
        {
            doc = RoundtripDxf(doc);
            if (explode) ExplodeInserts(doc);
            if (flattenBulges) FlattenBulges(doc);
            RemoveSpatialOutliers(doc);
        }

        Export(doc, output, tryWidth);
        var fi = new FileInfo(output);
        if (!fi.Exists || fi.Length < 64) throw new InvalidOperationException("png_empty");
        if (IsMostlyBlank(output)) throw new InvalidOperationException("png_blank");

        Console.WriteLine(
            $"ok bytes={fi.Length} width={tryWidth} explode={explode} flatten={flattenBulges} dxf={dxfRoundtrip}");
        Environment.Exit(0);
    }
    catch (Exception ex)
    {
        last = ex;
        Console.Error.WriteLine(
            $"png_try_failed width={tryWidth} explode={explode} flatten={flattenBulges} dxf={dxfRoundtrip}: {ex.Message}");
    }
}

Console.Error.WriteLine(last?.ToString() ?? "png_failed");
Environment.Exit(1);

static CadDocument ReadDocument(string input)
{
    var doc = DwgReader.Read(input, (_, e) =>
    {
        Console.Error.WriteLine($"acadsharp:{e.Message}");
    });

    foreach (var block in doc.BlockRecords)
    {
        block.IsExplodable = true;
    }

    return doc;
}

static CadDocument RoundtripDxf(CadDocument doc)
{
    var dxfPath = Path.Combine(Path.GetTempPath(), $"dwg2png-{Guid.NewGuid():N}.dxf");
    try
    {
        using (var writer = new DxfWriter(dxfPath, doc, binary: false))
        {
            writer.Write();
        }

        return DxfReader.Read(dxfPath, (_, e) =>
        {
            Console.Error.WriteLine($"acadsharp:{e.Message}");
        });
    }
    finally
    {
        try
        {
            File.Delete(dxfPath);
        }
        catch
        {
            /* ignore */
        }
    }
}

static void Export(CadDocument doc, string output, int maxDimension)
{
    var entities = doc.ModelSpace.Entities.ToList();
    var bounds = ComputeBounds(entities);
    if (bounds == null)
    {
        throw new InvalidOperationException("no_drawable_bounds");
    }

    var spanX = Math.Max(bounds.Value.Max.X - bounds.Value.Min.X, 1d);
    var spanY = Math.Max(bounds.Value.Max.Y - bounds.Value.Min.Y, 1d);

    int renderWidth;
    int renderHeight;
    if (spanX >= spanY)
    {
        renderWidth = maxDimension;
        renderHeight = Math.Clamp((int)Math.Round(maxDimension * spanY / spanX), 384, maxDimension);
    }
    else
    {
        renderHeight = maxDimension;
        renderWidth = Math.Clamp((int)Math.Round(maxDimension * spanX / spanY), 384, maxDimension);
    }

    const float paddingRatio = 0.02f;
    var padding = Math.Max(32f, maxDimension * paddingRatio);
    var drawableWidth = renderWidth - padding * 2;
    var drawableHeight = renderHeight - padding * 2;
    var pixelsPerUnit = (float)Math.Min(drawableWidth / spanX, drawableHeight / spanY);
    var scaledWidth = (float)spanX * pixelsPerUnit;
    var scaledHeight = (float)spanY * pixelsPerUnit;
    var offsetX = padding + (drawableWidth - scaledWidth) / 2f;
    var offsetY = padding + (drawableHeight - scaledHeight) / 2f;

    var context = new RenderContext(
        bounds.Value.Min.X,
        bounds.Value.Min.Y,
        pixelsPerUnit,
        offsetX,
        offsetY,
        renderHeight);

    using var image = new Image<Rgba32>(renderWidth, renderHeight);
    image.Mutate(x => x.BackgroundColor(SixLabors.ImageSharp.Color.Parse("#2b2b2b")));

    var strokeWidth = Math.Clamp(pixelsPerUnit * 0.065f, 1.35f, 4f);
    var curveSegments = pixelsPerUnit > 10 ? 160 : 112;

    foreach (var hatch in entities.OfType<Hatch>())
    {
        DrawHatch(image, hatch, context, curveSegments);
    }

    foreach (var entity in entities)
    {
        if (entity is Hatch) continue;
        DrawEntity(image, entity, context, strokeWidth, curveSegments);
    }

    image.SaveAsPng(output);

    var meta = new
    {
        minX = bounds.Value.Min.X,
        minY = bounds.Value.Min.Y,
        maxX = bounds.Value.Max.X,
        maxY = bounds.Value.Max.Y,
        imgW = renderWidth,
        imgH = renderHeight,
        maxDimension,
        pixelsPerUnit,
        offsetX,
        offsetY,
        insUnits = (int)doc.Header.InsUnits,
    };
    File.WriteAllText($"{output}.meta.json", JsonSerializer.Serialize(meta));
}

static void DrawHatch(Image<Rgba32> image, Hatch hatch, RenderContext context, int segments)
{
    var fillColor = ResolveColor(hatch);
    foreach (var path in hatch.Paths)
    {
        var points = path.GetPoints(segments).Select(p => context.ToPixel(p.Convert<XY>())).ToArray();
        if (points.Length < 3) continue;

        image.Mutate(x => x.FillPolygon(fillColor, points));
    }
}

static void DrawEntity(
    Image<Rgba32> image,
    Entity entity,
    RenderContext context,
    float strokeWidth,
    int segments)
{
    var stroke = ResolveColor(entity);

    switch (entity)
    {
        case Line line:
            image.Mutate(x => x.DrawLine(
                stroke,
                strokeWidth,
                context.ToPixel(line.StartPoint.Convert<XY>()),
                context.ToPixel(line.EndPoint.Convert<XY>())));
            break;
        case IPolyline polyline:
            DrawPolylinePoints(
                image,
                polyline.GetPoints<XY>(segments),
                context,
                stroke,
                strokeWidth,
                polyline.IsClosed);
            break;
        case Arc arc:
            DrawPolylinePoints(
                image,
                arc.PolygonalVertexes(segments).Select(v => v.Convert<XY>()),
                context,
                stroke,
                strokeWidth,
                false);
            break;
        case Circle circle:
            DrawPolylinePoints(
                image,
                circle.PolygonalVertexes(segments).Select(v => v.Convert<XY>()),
                context,
                stroke,
                strokeWidth,
                true);
            break;
        case Solid solid:
            image.Mutate(x => x.FillPolygon(
                stroke,
                context.ToPixel(solid.FirstCorner.Convert<XY>()),
                context.ToPixel(solid.SecondCorner.Convert<XY>()),
                context.ToPixel(solid.ThirdCorner.Convert<XY>()),
                context.ToPixel(solid.FourthCorner.Convert<XY>())));
            break;
    }
}

static void DrawPolylinePoints(
    Image<Rgba32> image,
    IEnumerable<XY> vertices,
    RenderContext context,
    SixLabors.ImageSharp.Color stroke,
    float strokeWidth,
    bool close)
{
    var points = vertices.Select(context.ToPixel).ToArray();
    if (points.Length < 2) return;

    if (close && points.Length >= 3)
    {
        var closed = new PointF[points.Length + 1];
        Array.Copy(points, closed, points.Length);
        closed[^1] = points[0];
        points = closed;
    }

    image.Mutate(x => x.DrawLine(stroke, strokeWidth, points));
}

static SixLabors.ImageSharp.Color ResolveColor(Entity entity)
{
    var color = entity.Color;
    if (color.IsByLayer && entity.Layer != null)
    {
        color = entity.Layer.Color;
    }

    ReadOnlySpan<byte> rgb = color.IsTrueColor ? color.GetTrueColorRgb() : color.GetRgb();
    return SixLabors.ImageSharp.Color.FromRgb(rgb[0], rgb[1], rgb[2]);
}

static BoundingBox? ComputeBounds(IReadOnlyList<Entity> entities)
{
    var points = new List<XY>();
    foreach (var entity in entities)
    {
        foreach (var pt in SampleBoundsPoints(entity))
        {
            points.Add(pt);
        }
    }

    if (points.Count >= 8)
    {
        var xs = points.Select(p => p.X).OrderBy(v => v).ToArray();
        var ys = points.Select(p => p.Y).OrderBy(v => v).ToArray();
        var minX = Percentile(xs, 0.01);
        var maxX = Percentile(xs, 0.99);
        var minY = Percentile(ys, 0.01);
        var maxY = Percentile(ys, 0.99);
        var margin = Math.Max(maxX - minX, maxY - minY) * 0.04 + 50;
        return new BoundingBox(minX - margin, minY - margin, 0, maxX + margin, maxY + margin, 0);
    }

    BoundingBox? bounds = null;
    foreach (var entity in entities)
    {
        var box = entity.GetBoundingBox();
        if (double.IsNaN(box.Min.X) || double.IsNaN(box.Min.Y) ||
            double.IsNaN(box.Max.X) || double.IsNaN(box.Max.Y))
        {
            continue;
        }

        bounds = bounds == null ? box : bounds.Value.Merge(box);
    }

    return bounds;
}

static IEnumerable<XY> SampleBoundsPoints(Entity entity)
{
    switch (entity)
    {
        case Hatch hatch:
            foreach (var path in hatch.Paths)
            {
                foreach (var pt in path.GetPoints(32))
                {
                    yield return pt.Convert<XY>();
                }
            }
            break;
        case Line line:
            yield return line.StartPoint.Convert<XY>();
            yield return line.EndPoint.Convert<XY>();
            break;
        case IPolyline polyline:
            foreach (var pt in polyline.GetPoints<XY>(32))
            {
                yield return pt;
            }
            break;
        case Arc arc:
            foreach (var pt in arc.PolygonalVertexes(16))
            {
                yield return pt.Convert<XY>();
            }
            break;
        case Circle circle:
            yield return circle.Center.Convert<XY>();
            break;
        case Solid solid:
            yield return solid.FirstCorner.Convert<XY>();
            yield return solid.SecondCorner.Convert<XY>();
            yield return solid.ThirdCorner.Convert<XY>();
            yield return solid.FourthCorner.Convert<XY>();
            break;
        default:
            var box = entity.GetBoundingBox();
            if (!double.IsNaN(box.Min.X))
            {
                yield return box.Min.Convert<XY>();
                yield return box.Max.Convert<XY>();
            }
            break;
    }
}

static bool IsMostlyBlank(string path)
{
    using var image = Image.Load<Rgba32>(path);
    var stepX = Math.Max(1, image.Width / 256);
    var stepY = Math.Max(1, image.Height / 256);
    var sampled = 0;
    var nonBg = 0;

    for (var y = 0; y < image.Height; y += stepY)
    {
        for (var x = 0; x < image.Width; x += stepX)
        {
            var px = image[x, y];
            if (Math.Max(Math.Abs(px.R - 43), Math.Max(Math.Abs(px.G - 43), Math.Abs(px.B - 43))) > 18)
            {
                nonBg += 1;
            }

            sampled += 1;
        }
    }

    return sampled > 0 && (double)nonBg / sampled < 0.002;
}

static void RemoveSpatialOutliers(CadDocument doc)
{
    var samples = new List<XY>();
    foreach (var entity in doc.ModelSpace.Entities)
    {
        foreach (var pt in SampleBoundsPoints(entity))
        {
            samples.Add(pt);
        }
    }

    if (samples.Count < 8) return;

    var xs = samples.Select(p => p.X).OrderBy(v => v).ToArray();
    var ys = samples.Select(p => p.Y).OrderBy(v => v).ToArray();
    var minX = Percentile(xs, 0.02);
    var maxX = Percentile(xs, 0.98);
    var minY = Percentile(ys, 0.02);
    var maxY = Percentile(ys, 0.98);
    var margin = Math.Max(maxX - minX, maxY - minY) * 0.15 + 500;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    var removed = 0;
    foreach (var entity in doc.ModelSpace.Entities.ToList())
    {
        var pts = SampleBoundsPoints(entity).ToList();
        if (pts.Count == 0) continue;
        var cx = pts.Average(p => p.X);
        var cy = pts.Average(p => p.Y);
        if (cx < minX || cx > maxX || cy < minY || cy > maxY)
        {
            doc.ModelSpace.Entities.Remove(entity);
            removed += 1;
        }
    }

    if (removed > 0)
    {
        Console.Error.WriteLine($"outliers_removed={removed} bbox=({minX:F0},{minY:F0})-({maxX:F0},{maxY:F0})");
    }
}

static double Percentile(double[] sorted, double p)
{
    if (sorted.Length == 0) return 0;
    var idx = (int)Math.Round((sorted.Length - 1) * p);
    idx = Math.Clamp(idx, 0, sorted.Length - 1);
    return sorted[idx];
}

static void RemoveInvalidArcs(CadDocument doc)
{
    foreach (var entity in doc.ModelSpace.Entities.ToList())
    {
        if (entity is Circle circle && circle.Radius <= 0)
        {
            doc.ModelSpace.Entities.Remove(circle);
        }
        else if (entity is Arc arc && arc.Radius <= 0)
        {
            doc.ModelSpace.Entities.Remove(arc);
        }
    }
}

static void FlattenBulges(CadDocument doc)
{
    foreach (var entity in doc.ModelSpace.Entities)
    {
        if (entity is not LwPolyline lwPolyline) continue;
        foreach (var vertex in lwPolyline.Vertices)
        {
            vertex.Bulge = 0;
        }
    }
}

static void ExplodeInserts(CadDocument doc)
{
    const int maxPasses = 32;
    for (var pass = 0; pass < maxPasses; pass++)
    {
        var inserts = doc.ModelSpace.Entities.OfType<Insert>().ToList();
        if (inserts.Count == 0) return;

        foreach (var insert in inserts)
        {
            try
            {
                var exploded = insert.Explode().ToList();
                doc.ModelSpace.Entities.Remove(insert);
                foreach (var child in exploded)
                {
                    doc.ModelSpace.Entities.Add(child);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"explode_skip:{insert.Handle}:{ex.Message}");
            }
        }
    }
}

readonly struct RenderContext(
    double originX,
    double originY,
    float pixelsPerUnit,
    float offsetX,
    float offsetY,
    int canvasHeight)
{
    public PointF ToPixel(XY point)
    {
        var x = offsetX + (float)((point.X - originX) * pixelsPerUnit);
        var y = canvasHeight - offsetY - (float)((point.Y - originY) * pixelsPerUnit);
        return new PointF(x, y);
    }
}
