import {
  ASPHALT_MIXES,
  CONCRETE_GRADES,
  CRUSHED_STONE_FRACTIONS,
  LAYER_THICKNESS_CM_MAX,
  LAYER_THICKNESS_CM_MIN,
  clampLayerThicknessCm,
  formatTons,
  formatVolumeM3,
  formatVolumeM3Range,
  type AsphaltMixId,
  type AsphaltOrderResult,
  type ConcreteGrade,
  type CrushedStoneFraction,
  type CrushedStoneOrderResult,
  type CurbConcreteOrderResult,
  type SandOrderResult,
  type SoilOrderResult,
} from '../../lib/dwgMaterialOrder'
import styles from './DwgViewerChrome.module.css'

type MaterialKind = 'none' | 'asphalt' | 'soil' | 'curbConcrete' | 'crushedStone' | 'sand'

type Props = {
  materialKind: MaterialKind
  onMaterialKind: (kind: MaterialKind) => void
  asphaltBinderCm: number
  onAsphaltBinderCm: (v: number) => void
  asphaltWearingCm: number
  onAsphaltWearingCm: (v: number) => void
  asphaltMixId: AsphaltMixId
  onAsphaltMixId: (id: AsphaltMixId) => void
  soilThicknessCm: number
  onSoilThicknessCm: (v: number) => void
  curbLockCm: number
  onCurbLockCm: (v: number) => void
  concreteGrade: ConcreteGrade
  onConcreteGrade: (g: ConcreteGrade) => void
  crushedStoneCm: number
  onCrushedStoneCm: (v: number) => void
  crushedStoneFraction: CrushedStoneFraction
  onCrushedStoneFraction: (f: CrushedStoneFraction) => void
  sandCm: number
  onSandCm: (v: number) => void
  asphaltOrder: AsphaltOrderResult | null
  soilOrder: SoilOrderResult | null
  curbConcreteOrder: CurbConcreteOrderResult | null
  crushedStoneOrder: CrushedStoneOrderResult | null
  sandOrder: SandOrderResult | null
}

export function DwgMaterialOrderPanel({
  materialKind,
  onMaterialKind,
  asphaltBinderCm,
  onAsphaltBinderCm,
  asphaltWearingCm,
  onAsphaltWearingCm,
  asphaltMixId,
  onAsphaltMixId,
  soilThicknessCm,
  onSoilThicknessCm,
  curbLockCm,
  onCurbLockCm,
  concreteGrade,
  onConcreteGrade,
  crushedStoneCm,
  onCrushedStoneCm,
  crushedStoneFraction,
  onCrushedStoneFraction,
  sandCm,
  onSandCm,
  asphaltOrder,
  soilOrder,
  curbConcreteOrder,
  crushedStoneOrder,
  sandOrder,
}: Props) {
  return (
    <div className={styles.materialCalc}>
      <p className={styles.materialCalcTitle}>Расчёт заказа</p>
      <div className={styles.materialKindRow} role="group" aria-label="Тип материала">
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'none' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'none'}
          onClick={() => onMaterialKind('none')}
        >
          Только площадь
        </button>
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'asphalt' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'asphalt'}
          onClick={() => onMaterialKind('asphalt')}
        >
          Асфальт, т
        </button>
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'soil' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'soil'}
          onClick={() => onMaterialKind('soil')}
        >
          Грунт, м³
        </button>
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'curbConcrete' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'curbConcrete'}
          onClick={() => onMaterialKind('curbConcrete')}
        >
          Бетон, м³
        </button>
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'crushedStone' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'crushedStone'}
          onClick={() => onMaterialKind('crushedStone')}
        >
          Щебень, м³
        </button>
        <button
          type="button"
          className={`${styles.materialKindBtn} ${materialKind === 'sand' ? styles.materialKindBtnActive : ''}`}
          aria-pressed={materialKind === 'sand'}
          onClick={() => onMaterialKind('sand')}
        >
          Песок, м³
        </button>
      </div>

      {materialKind === 'asphalt' ? (
        <div className={styles.materialBody}>
          <div className={styles.materialFields}>
            <label className={styles.materialField}>
              <span>Нижний слой</span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={asphaltBinderCm}
                  onChange={(e) => onAsphaltBinderCm(Math.max(0, Number(e.target.value) || 0))}
                />
                <em>см</em>
              </span>
            </label>
            <label className={styles.materialField}>
              <span>Верхний слой</span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={asphaltWearingCm}
                  onChange={(e) => onAsphaltWearingCm(Math.max(0, Number(e.target.value) || 0))}
                />
                <em>см</em>
              </span>
            </label>
          </div>
          <p className={styles.asphaltMixTitle}>Вид асфальта</p>
          <div className={styles.concreteGradeRow} role="group" aria-label="Вид асфальта">
            {ASPHALT_MIXES.map((mix) => (
              <button
                key={mix.id}
                type="button"
                className={`${styles.concreteGradeBtn} ${asphaltMixId === mix.id ? styles.concreteGradeBtnActive : ''}`}
                aria-pressed={asphaltMixId === mix.id}
                title={`${mix.densityTPerM3} т/м³`}
                onClick={() => onAsphaltMixId(mix.id)}
              >
                {mix.label}
              </button>
            ))}
          </div>
          {asphaltOrder ? (
            <dl className={styles.materialResult}>
              <div>
                <dt>
                  Нижний слой {asphaltOrder.binderCm} см · {asphaltOrder.binderMixLabel} (
                  {asphaltOrder.binderDensityTPerM3} т/м³)
                </dt>
                <dd>{formatTons(asphaltOrder.binderTons)}</dd>
              </div>
              <div>
                <dt>
                  Верхний слой {asphaltOrder.wearingCm} см · {asphaltOrder.wearingMixLabel} (
                  {asphaltOrder.wearingDensityTPerM3} т/м³)
                </dt>
                <dd>{formatTons(asphaltOrder.wearingTons)}</dd>
              </div>
              <div className={styles.materialResultTotal}>
                <dt>К заказу</dt>
                <dd>{formatTons(asphaltOrder.totalTons)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {materialKind === 'soil' ? (
        <div className={styles.materialBody}>
          <div className={styles.materialFields}>
            <label className={styles.materialField}>
              <span>Толщина грунта</span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={soilThicknessCm}
                  onChange={(e) => onSoilThicknessCm(Math.max(0, Number(e.target.value) || 0))}
                />
                <em>см</em>
              </span>
            </label>
          </div>
          {soilOrder ? (
            <dl className={styles.materialResult}>
              <div className={styles.materialResultTotal}>
                <dt>Грунт к заказу</dt>
                <dd>{formatVolumeM3(soilOrder.volumeM3)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {materialKind === 'curbConcrete' ? (
        <div className={styles.materialBody}>
          <div className={styles.concreteGradeRow} role="group" aria-label="Марка бетона">
            {CONCRETE_GRADES.map((grade) => (
              <button
                key={grade}
                type="button"
                className={`${styles.concreteGradeBtn} ${concreteGrade === grade ? styles.concreteGradeBtnActive : ''}`}
                aria-pressed={concreteGrade === grade}
                onClick={() => onConcreteGrade(grade)}
              >
                {grade}
              </button>
            ))}
          </div>
          <div className={styles.materialFields}>
            <label className={styles.materialField}>
              <span>Замок бордюра</span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  value={curbLockCm}
                  onChange={(e) => onCurbLockCm(Math.max(0, Number(e.target.value) || 0))}
                />
                <em>см</em>
              </span>
            </label>
          </div>
          {curbConcreteOrder ? (
            <dl className={styles.materialResult}>
              <div>
                <dt>Диапазон</dt>
                <dd>
                  {formatVolumeM3Range(
                    curbConcreteOrder.volumeM3Min,
                    curbConcreteOrder.volumeM3Max,
                  )}
                </dd>
              </div>
              <div className={styles.materialResultTotal}>
                <dt>К заказу (среднее)</dt>
                <dd>{formatVolumeM3(curbConcreteOrder.volumeM3Mid)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {materialKind === 'crushedStone' ? (
        <div className={styles.materialBody}>
          <div className={styles.materialFields}>
            <label className={styles.materialField}>
              <span>
                Толщина слоя ({LAYER_THICKNESS_CM_MIN}–{LAYER_THICKNESS_CM_MAX} см)
              </span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={LAYER_THICKNESS_CM_MIN}
                  max={LAYER_THICKNESS_CM_MAX}
                  step={1}
                  inputMode="decimal"
                  value={crushedStoneCm}
                  onChange={(e) => onCrushedStoneCm(clampLayerThicknessCm(Number(e.target.value)))}
                />
                <em>см</em>
              </span>
            </label>
          </div>
          <div className={styles.concreteGradeRow} role="group" aria-label="Фракция щебня">
            {CRUSHED_STONE_FRACTIONS.map((fraction) => (
              <button
                key={fraction}
                type="button"
                className={`${styles.concreteGradeBtn} ${crushedStoneFraction === fraction ? styles.concreteGradeBtnActive : ''}`}
                aria-pressed={crushedStoneFraction === fraction}
                onClick={() => onCrushedStoneFraction(fraction)}
              >
                {fraction}
              </button>
            ))}
          </div>
          {crushedStoneOrder ? (
            <dl className={styles.materialResult}>
              <div className={styles.materialResultTotal}>
                <dt>Щебень к заказу</dt>
                <dd>{formatVolumeM3(crushedStoneOrder.volumeM3)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {materialKind === 'sand' ? (
        <div className={styles.materialBody}>
          <div className={styles.materialFields}>
            <label className={styles.materialField}>
              <span>
                Толщина слоя ({LAYER_THICKNESS_CM_MIN}–{LAYER_THICKNESS_CM_MAX} см)
              </span>
              <span className={styles.materialInputWrap}>
                <input
                  type="number"
                  min={LAYER_THICKNESS_CM_MIN}
                  max={LAYER_THICKNESS_CM_MAX}
                  step={1}
                  inputMode="decimal"
                  value={sandCm}
                  onChange={(e) => onSandCm(clampLayerThicknessCm(Number(e.target.value)))}
                />
                <em>см</em>
              </span>
            </label>
          </div>
          {sandOrder ? (
            <dl className={styles.materialResult}>
              <div className={styles.materialResultTotal}>
                <dt>Песок к заказу</dt>
                <dd>{formatVolumeM3(sandOrder.volumeM3)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
