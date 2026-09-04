# Application styles

`../index.css` is the stylesheet entry point. It imports these modules in
numeric order because the existing cascade is order-sensitive.

- `01-foundation-shell-dashboard.css`: tokens, resets, shell, navigation, dashboard
- `02-restaurant-inputs.css`: restaurant expense, sales, and input workflows
- `03-orders-catalog.css`: order lists, products, packages, and shared tables
- `04-delivery-settings.css`: delivery portal, settings, dialogs, and shared forms
- `05-kitchen-costs-reports.css`: kitchen cost input and kitchen reporting
- `06-inventory-migration.css`: inventory, stocktake, and migration interfaces
- `07-reports.css`: shared and restaurant report layouts
- `08-orders-quotes.css`: order and quote operational workflows
- `09-factory-printing.css`: factory boards, printing, and document output
- `10-report-ai-shell.css`: report AI, authentication, and shell responsiveness
- `11-report-pages.css`: advertising and restaurant report pages
- `12-editors-documents.css`: order/quote editors and editable documents
- `13-layout-overrides.css`: late responsive and application-specific overrides

Place new rules in the closest domain module. Add a new numbered module only
when the domain does not fit an existing file, and keep imports ordered.
