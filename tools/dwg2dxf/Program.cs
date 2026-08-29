using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: Dwg2Dxf <input.dwg> <output.dxf>");
    Environment.Exit(2);
}

string input = args[0];
string output = args[1];

var configuration = new DwgReaderConfiguration
{
    KeepUnknownEntities = true,
    KeepUnknownNonGraphicalObjects = false,
    ReadSummaryInfo = false,
};

CadDocument doc;
using (var reader = new DwgReader(input, configuration))
{
    reader.OnNotification += (_, e) =>
    {
        if (e.MessageType is NotificationType.Error or NotificationType.Warning)
        {
            Console.Error.WriteLine($"acadsharp:{e.MessageType}:{e.Message}");
        }
    };
    doc = reader.Read();
}

foreach (var block in doc.BlockRecords)
{
    block.IsExplodable = true;
}

// Вставки блоков (INSERT) часто теряются в web-viewer — разворачиваем в плоскую геометрию.
ExplodeInserts(doc);

try
{
    doc.Header.Version = ACadVersion.AC1032;
}
catch
{
    doc.Header.Version = ACadVersion.AC1018;
}

using (var writer = new DxfWriter(output, doc, binary: false))
{
    writer.Write();
}

var fi = new FileInfo(output);
if (!fi.Exists || fi.Length < 32)
{
    Console.Error.WriteLine("empty_dxf");
    Environment.Exit(1);
}

Console.WriteLine($"ok bytes={fi.Length} entities={doc.Entities.Count()}");

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
                foreach (var entity in exploded)
                {
                    doc.ModelSpace.Entities.Add(entity);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"explode_skip:{insert.Handle}:{ex.Message}");
            }
        }
    }
}
