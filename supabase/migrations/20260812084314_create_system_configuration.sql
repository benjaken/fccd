create table public.system_config_sets (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  source_name text not null unique,
  display_name text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'retired')),
  source_system text not null default 'bubble',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.system_config_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  config_set_id uuid not null
    references public.system_config_sets (id) on delete cascade,
  attribute_key text not null,
  source_name text not null,
  value_type text not null
    check (value_type in ('text', 'boolean', 'number', 'date', 'text_list', 'json')),
  is_required boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_set_id, attribute_key),
  unique (config_set_id, source_name)
);

create table public.system_config_options (
  id uuid primary key default gen_random_uuid(),
  config_set_id uuid not null
    references public.system_config_sets (id) on delete cascade,
  option_key text not null,
  source_value text not null,
  display_value text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_deprecated boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_set_id, option_key),
  unique (config_set_id, source_value)
);

create table public.system_config_option_attributes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null
    references public.system_config_options (id) on delete cascade,
  attribute_definition_id uuid not null
    references public.system_config_attribute_definitions (id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, attribute_definition_id)
);

create index system_config_sets_status_sort_idx
  on public.system_config_sets (status, sort_order);
create index system_config_attribute_definitions_set_sort_idx
  on public.system_config_attribute_definitions (config_set_id, sort_order);
create index system_config_options_set_sort_idx
  on public.system_config_options (config_set_id, sort_order);
create index system_config_option_attributes_definition_idx
  on public.system_config_option_attributes (attribute_definition_id);

alter table public.system_config_sets enable row level security;
alter table public.system_config_attribute_definitions enable row level security;
alter table public.system_config_options enable row level security;
alter table public.system_config_option_attributes enable row level security;

revoke all on table
  public.system_config_sets,
  public.system_config_attribute_definitions,
  public.system_config_options,
  public.system_config_option_attributes
from anon, authenticated;

grant select, insert, update, delete on table
  public.system_config_sets,
  public.system_config_attribute_definitions,
  public.system_config_options,
  public.system_config_option_attributes
to service_role;

comment on table public.system_config_sets is
  'System Settings configuration groups migrated from Bubble Option Sets.';
comment on table public.system_config_options is
  'Ordered configuration values. Application RLS and editing workflows are added with each system module.';
