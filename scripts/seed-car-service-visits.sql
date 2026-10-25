-- Optional seed: Proton X50 service visits from spreadsheet headers (dates + odometer only).
-- Run once, after AI Agent/scripts/migrate-car-service.sql. Skip if you prefer entering visits in the Car tab.
-- Safe to re-run: a visit with the same date and odometer is skipped, so nothing is duplicated.

INSERT INTO car_service_visits (date, odometer_km)
SELECT v.date, v.odometer_km
FROM (VALUES
  ('2022-07-04', 1018),
  ('2023-01-07', 9413),
  ('2023-07-21', 15164),
  ('2024-01-22', 20453),
  ('2024-08-05', 29365),
  ('2025-02-24', 36462),
  ('2025-09-22', 44904),
  ('2026-03-31', 54775),
  ('2026-08-17', 60318)
) AS v (date, odometer_km)
WHERE NOT EXISTS (
  SELECT 1 FROM car_service_visits c
  WHERE c.date = v.date AND c.odometer_km = v.odometer_km
);
