
create or replace function public.custom_headers() returns void as $$
begin
    perform set_config('response.headers', '[{"Access-Control-Allow-Origin": "*"}]', false);
end; $$ language plpgsql;
