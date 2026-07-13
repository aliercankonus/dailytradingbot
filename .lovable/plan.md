# Aksiyon Planı: Sistemi Sadeleştir & Karar Alınabilir Hale Getir

Amaç: 30 gate + 9,583 satır constants + 8 katmanlı StochRSI kullanımından, **teşhis edilebilir + deterministik + 8 gate'lik** bir mimariye geçmek. Her faz kendi başına deploy edilebilir; bir sonrakine geçmeden önce ölçülür.

---

## Faz 0 — Ölç (Yarım Gün)

Şu an rejection tablosu boş, gate stats aggregate. Kanıtsız kesim yapmayacağız.

1. `cleanup-expired-signals` içinde `signal_rejection_log` retention'ı **7 gün → 30 gün**.
2. `gate-pipeline.ts` içindeki her `fail(reason)` çağrısına ikinci parametre olarak `family` etiketi ekle: `QUALITY | ADX | STOCH | DIRECTION | REGIME | STRATEGY | RISK | PORTFOLIO`.
3. `signal_rejection_log`'a `gate_family` kolonu ekle (migration + backfill NULL).
4. `StrategyForensicDashboard`'a yeni tab: **"Gate Family Breakdown"** — son 7 gün / 30 gün toggle, family bazında bar chart + top 5 detay reason.
5. **Canonical backtest** tanımla: sabit sembol seti (BTC/ETH/SOL/BNB/XRP/ADA/AVAX), sabit 60 gün pencere, sabit config → `backtest-runner`'a `--profile=canonical` flag.

**Çıktı:** Hangi gate ailesi gerçekten baskın, sayısal olarak biliyoruz.

---

## Faz 1 — StochRSI'yi Tek Otoriteye İndir (1 Gün)

Şu an 8 farklı yerde çelişkili şekilde kullanılıyor.

1. `_shared/stoch-authority.ts` yeni dosya: tek fonksiyon `evaluateStochContext(mfs, direction, adxSlope)` → döner:
   - `isExtreme: boolean` (hard block adayı, sadece K<1 veya K>99)
   - `isFavorable: boolean` (trend yönüyle uyumlu extreme)
   - `runwayMultiplier: 0.5–1.0` (soft sizing)
2. Şu gate'leri **kaldır** ve yerini `stochContext` alsın:
   - `LTF_SPIKE_PROTECTION`, `PRE_MOMENTUM_STOCHRSI`, `STOCHRSI_RUNWAY`, `SQUEEZE_BUY_OVERBOUGHT`, `STRONG_TREND_STOCH_OVERBOUGHT/OVERSOLD`, `NEAR_EXTREME_PROTECTION`.
3. Kalan **tek StochRSI gate**: `STOCH_EXTREME_HARD_BLOCK` (yalnız K<1 SHORT / K>99 LONG). Diğer her şey `runwayMultiplier` üzerinden pozisyona etki eder.
4. Docs: 6 markdown dosyasını sil, tek `STOCH_AUTHORITY.md` ekle.
5. Unit test: `stoch-authority.test.ts` — 12 senaryo.

---

## Faz 2 — Quality Score'u Decompose Et (1 Gün)

`VERY_LOW_QUALITY` en büyük reddedici ama opak.

1. Tek `qualityScore` (0-100) yerine üç alt-skor:
   - `entryQ` (0-100): timing (StochRSI runway, LTF confirmation)
   - `trendQ` (0-100): ADX, ADX slope, HTF alignment
   - `contextQ` (0-100): volume, ATR, regime uygunluğu
2. Tek `qualityFloor` yerine strateji başına 3 floor: `strategy.floors = { entryQ, trendQ, contextQ }`. Her sinyal 3'ünü de geçmeli.
3. Symbol/side bazlı hard block'ları kaldır (`ADAUSDT SHORT`, `ETHUSDT SELL Q≥60`) → yerine `symbolPerformanceMultiplier` (soft, 0.3–1.0, son 30 gün WR'den türet).
4. Forensic dashboard: rejection'da hangi alt-skorun floor'u geçemediği görünsün.
5. `constants.ts`'i böl:
   - `constants/adx.ts`
   - `constants/stoch.ts`
   - `constants/quality.ts`
   - `constants/strategies/{strongTrend,squeeze,meanReversion}.ts`
   - `constants/risk.ts`
   - `constants/index.ts` (barrel)

---

## Faz 3 — Gate Sayısını 8'e İndir (2 Gün)

Kalacak 8 essential gate:

```text
1. ADX_MINIMUM              (hard: ADX < 18)
2. DIRECTION_CONVICTION     (hard: NO_DIRECTION)
3. MOMENTUM_POLARITY        (hard: opposing accel score > 50)
4. STOCH_EXTREME_HARD_BLOCK (hard: K<1 SHORT / K>99 LONG)
5. QUALITY_FLOOR            (hard: entryQ/trendQ/contextQ herhangi biri floor altı)
6. REGIME_ALLOWLIST         (hard: strateji × regime whitelist)
7. STRATEGY_PERFORMANCE     (hard: 30-gün WR < 25%)
8. PORTFOLIO_LIMIT          (hard: 3 pozisyon / 2% günlük risk)
```

Diğer her şey (~22 gate) → **risk score contributor** (soft sizing, position × multiplier).

1. `gate-pipeline.ts` yeniden yaz — 620 satır → ~250 satır hedef.
2. Kaldırılan gate'lerin dokümantasyonunu `docs/gates/_archive/` altına taşı (silme, tarihe kayıt).
3. Memory index temizliği: 60+ `mem://` kuralından decommission edilenler için silme (`legacy-decommissioning` memory'sine ekle).
4. Regression: her gate için minimum 1 unit test (`gate-logic.test.ts` genişletmesi).

---

## Faz 4 — Determinism & Guardrail (Yarım Gün)

1. `backtest-runner` için sabit seed, deterministik randomizasyon.
2. CI benzeri check: her gate/config değişikliğinden sonra canonical backtest çalışır, sonuç bir önceki ile ±10% içinde olmalı (yoksa uyarı).
3. `.lovable/plan.md`'e "add-only" yasağı: yeni gate önerisi ancak bir eskisi decommission edilirse geçer (memory'e "Configuration Bloat Limit"i aktive et).

---

## Teknik Notlar

**Migration'lar:**
- `signal_rejection_log`: `gate_family text` kolonu
- Retention job update (`cleanup-expired-signals` fonksiyonu)

**Etkilenen dosyalar:**
- `supabase/functions/_shared/gate-pipeline.ts` (major refactor)
- `supabase/functions/_shared/constants.ts` (bölünecek)
- `supabase/functions/_shared/market-feature-snapshot.ts` (stochContext ekleme)
- Yeni: `_shared/stoch-authority.ts`, `_shared/quality-score.ts`
- `strategy-analyzer/index.ts` (gate çağrıları sadeleşecek)
- `StrategyForensicDashboard.tsx` (Gate Family + Quality Decompose UI)
- `docs/gates/` (6 dosya sil, 8'e indir)

**Risk azaltma:**
- Her faz sonunda canonical backtest karşılaştırması
- Feature flag: `USE_LEGACY_GATE_PIPELINE=true` ile eskiye dönüş
- Faz 3'ten önce Faz 0'ın verisi ışığında gate listesi doğrulanır

---

## Beklenen Sonuç

| Metrik | Şimdi | Hedef |
|---|---|---|
| Aktif gate sayısı | 30 | 8 hard + 22 soft contributor |
| `fail()` noktası | 110 | ~40 |
| `constants.ts` en büyük dosya | 9,583 satır | <2,000 (bölünmüş) |
| StochRSI kullanım katmanı | 8 | 1 authority + soft multiplier |
| Aynı config backtest tekrar edilebilirliği | ±%80 dalgalanma | ±%5 |
| Quality reddi açıklanabilirliği | Opak tek skor | 3 alt-skorlu + hangi floor kaldı |
| Rejection retention | 7 gün / şu an boş | 30 gün + family etiketli |

Onaylarsan Faz 0 ile başlıyorum.
