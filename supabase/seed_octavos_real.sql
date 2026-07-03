-- ============================================================================
-- Octavos de final REALES del Mundial 2026 (al 3 de julio de 2026).
-- Actualiza los 8 partidos placeholder del seed original (mismos IDs, así se
-- conservan los vínculos en pool_matches). Correr en el SQL Editor de Supabase.
--
-- OJO: si ya había predicciones guardadas sobre los placeholders, quedan
-- asociadas a estos partidos con los equipos nuevos — pide a los jugadores
-- revisar/actualizar sus pronósticos.
--
-- Los partidos 7 y 8 dependen de los 32avos del 3 de julio:
--   P7: Argentina/Cabo Verde vs Australia/Egipto (hora por confirmar)
--   P8: Suiza vs Colombia/Ghana (hora por confirmar)
-- Cuando se definan, edítalos desde el panel Admin (equipos, banderas y hora).
-- Horas en Eastern Time (UTC-4); la web las muestra en hora de Perú.
-- ============================================================================

update public.matches set home_team='Canadá',         away_team='Marruecos',          home_flag='🇨🇦', away_flag='🇲🇦', kickoff='2026-07-04 13:00:00-04' where id='00000000-0000-0000-0000-000000000001';
update public.matches set home_team='Paraguay',       away_team='Francia',            home_flag='🇵🇾', away_flag='🇫🇷', kickoff='2026-07-04 17:00:00-04' where id='00000000-0000-0000-0000-000000000002';
update public.matches set home_team='Brasil',         away_team='Noruega',            home_flag='🇧🇷', away_flag='🇳🇴', kickoff='2026-07-05 16:00:00-04' where id='00000000-0000-0000-0000-000000000003';
update public.matches set home_team='México',         away_team='Inglaterra',         home_flag='🇲🇽', away_flag='🏴󠁧󠁢󠁥󠁮󠁧󠁿', kickoff='2026-07-05 20:00:00-04' where id='00000000-0000-0000-0000-000000000004';
update public.matches set home_team='Portugal',       away_team='España',             home_flag='🇵🇹', away_flag='🇪🇸', kickoff='2026-07-06 15:00:00-04' where id='00000000-0000-0000-0000-000000000005';
update public.matches set home_team='Estados Unidos', away_team='Bélgica',            home_flag='🇺🇸', away_flag='🇧🇪', kickoff='2026-07-06 20:00:00-04' where id='00000000-0000-0000-0000-000000000006';
update public.matches set home_team='Argentina/Cabo Verde', away_team='Australia/Egipto', home_flag='⏳', away_flag='⏳', kickoff='2026-07-07 16:00:00-04' where id='00000000-0000-0000-0000-000000000007';
update public.matches set home_team='Suiza',          away_team='Colombia/Ghana',     home_flag='🇨🇭', away_flag='⏳', kickoff='2026-07-07 20:00:00-04' where id='00000000-0000-0000-0000-000000000008';

-- Limpiar resultados por si los placeholders tenían datos de prueba.
update public.matches set result_home=null, result_away=null, winner_team=null
where id in (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008'
);

-- Deadline de la polla Vertix = primer kickoff de octavos.
update public.pools set deadline='2026-07-04 13:00:00-04' where id='00000000-0000-0000-0000-0000000000f0';
