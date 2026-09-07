# Application styles

`../index.css` is the stylesheet entry point. It imports these modules in
numeric order because the existing cascade is order-sensitive.

- `01-restaurant-portal.css`: restaurant portal and customer-service additions
- `02-foundation-shell-dashboard.css`: tokens, resets, shell, navigation, dashboard
- `03-restaurant-inputs.css`: restaurant expense, sales, and input workflows
- `04-orders-catalog.css`: order lists, products, packages, and shared tables
- `05-delivery-settings.css`: delivery portal, settings, dialogs, and shared forms
- `06-kitchen-costs-reports.css`: kitchen cost input and kitchen reporting
- `07-inventory-migration.css`: inventory, stocktake, and migration interfaces
- `08-reports.css`: shared and restaurant report layouts
- `09-orders-quotes.css`: order and quote operational workflows
- `10-factory-printing.css`: factory boards, printing, and document output
- `11-report-ai-shell.css`: report AI, authentication, and shell responsiveness
- `12-report-pages.css`: advertising and restaurant report pages
- `13-editors-documents.css`: order/quote editors and editable documents
- `14-layout-overrides.css`: late responsive and application-specific overrides

These numbered files are legacy global styles. Do not add a new numbered file
or append component-specific rules to `14-layout-overrides.css`.

New or substantially changed components should keep their styles beside the
component in `<ComponentName>.module.css`. Keep responsive rules in the same
module as the base rule, use `:global(...)` only when styling a shared child
component, and keep each module below 600 lines. Existing global styles can be
migrated incrementally when their owning component is changed.
