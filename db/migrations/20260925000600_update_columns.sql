-- migrate:up
revoke update on app.teams, app.work_models from zeit_app;
grant update (name) on app.teams to zeit_app;
grant update (name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun, archived_at)
  on app.work_models to zeit_app;

-- migrate:down
revoke update (name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun, archived_at)
  on app.work_models from zeit_app;
revoke update (name) on app.teams from zeit_app;
grant update on app.teams, app.work_models to zeit_app;
