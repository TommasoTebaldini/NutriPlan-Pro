-- Cosa fa questa migrazione: aggiunge ON DELETE CASCADE alle foreign key
--   diet_meals.diet_id -> patient_diets(id)
--   meal_completions.diet_meal_id -> diet_meals(id)
-- Perché: senza CASCADE, cancellare una dieta richiede di cancellare prima
--   manualmente i suoi diet_meals (altrimenti l'eliminazione fallisce per
--   violazione FK), e se il paziente ha già "completato" un pasto in
--   meal_completions, l'eliminazione del diet_meal corrispondente fallisce
--   a sua volta a metà. Risultato osservato: diete che restano "attive"
--   (is_active=true) ma con zero pasti nel client paziente
--   (Diet-Plan-Pro-app-claude), invece di essere pulite atomicamente.
--   Con CASCADE, cancellare una patient_diets pulisce automaticamente
--   diet_meals e meal_completions collegati, in un solo passaggio atomico.
-- Data: 2026-09-13
--
-- Nota: queste tabelle vivono nello stesso database condiviso da
-- NutriPlan-Pro (dietista) e Diet-Plan-Pro-app-claude (paziente); questo
-- file è nell'unico registro di migrazioni condiviso (vedi MIGRATIONS.md).

alter table diet_meals
  drop constraint if exists diet_meals_diet_id_fkey;

alter table diet_meals
  add constraint diet_meals_diet_id_fkey
  foreign key (diet_id) references patient_diets(id) on delete cascade;

alter table meal_completions
  drop constraint if exists meal_completions_diet_meal_id_fkey;

alter table meal_completions
  add constraint meal_completions_diet_meal_id_fkey
  foreign key (diet_meal_id) references diet_meals(id) on delete cascade;
