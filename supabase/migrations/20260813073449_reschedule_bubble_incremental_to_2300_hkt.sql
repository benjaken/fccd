do $$
declare
  configured_jobs integer;
begin
  select count(*)
    into configured_jobs
  from cron.job
  where jobname in (
    'fccd-bubble-incremental-a',
    'fccd-bubble-incremental-b',
    'fccd-bubble-incremental-c',
    'fccd-bubble-incremental-d1',
    'fccd-bubble-incremental-d2',
    'fccd-bubble-incremental-e',
    'fccd-bubble-incremental-remaining'
  );

  if configured_jobs <> 7 then
    raise exception
      'Expected 7 FCCD Bubble incremental jobs, found %',
      configured_jobs;
  end if;
end
$$;

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-a'),
  schedule := '0 15 * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-b'),
  schedule := '3 15 * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-c'),
  schedule := '6 15 * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-d1'),
  schedule := '9 15 * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-d2'),
  schedule := '12 15 * * *'
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'fccd-bubble-incremental-e'),
  schedule := '15 15 * * *'
);
select cron.alter_job(
  job_id := (
    select jobid
    from cron.job
    where jobname = 'fccd-bubble-incremental-remaining'
  ),
  schedule := '18 15 * * *'
);
