# Bubble Data Types Inventory

> Local research note. Do not commit or push this file.
>
> Captured from Bubble Editor screenshots on 2026-08-12 and cross-checked
> against the production Swagger inventory.

## Summary

- Bubble Editor data types: **103**
- Types with Privacy Rules applied: **69**
- Privacy-rule types documented: **69 / 69**
- Publicly visible types: **34**
- Types with detailed Swagger schemas: **98**
- Editor-only types supplemented by screenshots: **5**
- Detailed Swagger totals: **1,054 fields** and **242 explicit relationships**

The visibility labels below only record the Bubble Editor overview. They do not
capture the actual Privacy Rule conditions or field permissions.

## Complete Editor Inventory

| Data type | Editor visibility |
|---|---|
| A_Customers | Publicly visible |
| A_Label | Privacy rules applied |
| A_Order | Privacy rules applied |
| A_Packages | Publicly visible |
| A_Products | Privacy rules applied |
| Announcement | Privacy rules applied |
| B_ads Cost Weekly | Privacy rules applied |
| B_cost Monthly | Privacy rules applied |
| B_delivery Schedule | Privacy rules applied |
| B_delivery Schedule_surcharge | Publicly visible |
| B_Product_Ingredients | Publicly visible |
| B_supplierPurchase | Privacy rules applied |
| Bento_main Ingredients | Publicly visible |
| Bento_main Type | Publicly visible |
| Bento_number Of Column | Publicly visible |
| Bento_special Request | Publicly visible |
| Cal_Control | Publicly visible |
| Cal_Package_choice | Publicly visible |
| DS AO Product | Publicly visible |
| DS AO_blockDate | Publicly visible |
| DS Commu Channels (Quote) | Privacy rules applied |
| DS Reminder Person(First) | Privacy rules applied |
| DS Reminder Person(Second) | Privacy rules applied |
| DS Source Of Sales (Quote) | Privacy rules applied |
| DS__ingredient_Supplier | Privacy rules applied |
| DS_bento_additional Item | Publicly visible |
| DS_bento_event Part | Publicly visible |
| DS_Channel | Publicly visible |
| DS_Collection | Publicly visible |
| DS_CookType | Privacy rules applied |
| DS_cost_type | Privacy rules applied |
| DS_customer_tag | Privacy rules applied |
| DS_customer_tag_type | Privacy rules applied |
| DS_delivery District | Privacy rules applied |
| DS_delivery Surcharge | Privacy rules applied |
| DS_driver Assign Remind | Privacy rules applied |
| DS_Festival | Privacy rules applied |
| DS_Ingredients | Privacy rules applied |
| DS_Packing | Publicly visible |
| DS_Payment Method | Privacy rules applied |
| DS_Purchase Type | Privacy rules applied |
| DS_quote_delivery | Privacy rules applied |
| DS_quote_payment | Privacy rules applied |
| DS_quote_T&C | Privacy rules applied |
| DS Sales Partner | Privacy rules applied |
| DS Shipping Method | Privacy rules applied |
| DS_Status | Privacy rules applied |
| DS_Super_Motorcade | Privacy rules applied |
| DS_Super_Motorcade_subDriver | Publicly visible |
| DS_Tags | Publicly visible |
| DS_Type | Publicly visible |
| Font | Publicly visible |
| M_cal_to_kg | Publicly visible |
| M_calculation% | Publicly visible |
| M_customer | Privacy rules applied |
| M_doneMeat | Privacy rules applied |
| M_doneMeat_stock | Privacy rules applied |
| M_MeatSeasoning_cost | Publicly visible |
| M_Monthly_MeatPrice | Publicly visible |
| M_outDone_doneMeat | Privacy rules applied |
| M_outDone_order | Privacy rules applied |
| M_raw_stock | Privacy rules applied |
| M_rawMeat | Privacy rules applied |
| M_seasoning | Privacy rules applied |
| M_shippingMethod | Publicly visible |
| MM_Products | Publicly visible |
| NOS_order Tag | Privacy rules applied |
| OS Driver_menu | Publicly visible |
| Print_Label | Publicly visible |
| Quote_bento_additional Item | Privacy rules applied |
| Quote_bento_event Part | Privacy rules applied |
| Quote_file | Publicly visible |
| Quote_payment Method | Privacy rules applied |
| Quote_T&C | Privacy rules applied |
| S_comment | Publicly visible |
| S_customer_tag | Publicly visible |
| S_ingredient_stocktake | Privacy rules applied |
| S_Ingredients_Product | Privacy rules applied |
| S_Order | Privacy rules applied |
| S_Packages_ChoiceSet | Privacy rules applied |
| S_Packages_Product | Publicly visible |
| S_Packing_Stocktake | Privacy rules applied |
| S_Payment | Privacy rules applied |
| S_Payment Report | Privacy rules applied |
| SHOP DS Restro | Privacy rules applied |
| SHOP DS_Purchase Type | Privacy rules applied |
| SHOP_dailySales | Privacy rules applied |
| SHOP_DS Cost | Privacy rules applied |
| SHOP_DS Cost_type | Privacy rules applied |
| SHOP_DS Payment Method | Privacy rules applied |
| SHOP_DS Restro_period | Privacy rules applied |
| SHOP_DS_holiday | Privacy rules applied |
| SHOP_DS_new_product | Privacy rules applied |
| SHOP_DS_restro_depart | Privacy rules applied |
| SHOP_DS_staff_list | Privacy rules applied |
| SHOP_DS_time_slot | Privacy rules applied |
| SHOP_food_deli_platform | Privacy rules applied |
| SHOP_Ingredients | Privacy rules applied |
| SHOP_monthly_cost | Privacy rules applied |
| SHOP_roster | Publicly visible |
| SHOP_StockTake | Privacy rules applied |
| SHOP_supplier_purchase | Privacy rules applied |
| User | Privacy rules applied |

## Types Missing from Swagger

### MM_Products

| Field | Bubble type |
|---|---|
| Add-on label 1A | text |
| Add-on label 1B | text |
| Add-on label 2A | text |
| Add-on label 2B | text |
| Add-on label 3A | text |
| Add-on label 3B | text |
| Add-on label 4A | text |
| Add-on label 4B | text |
| Add-on label 5A | text |
| Add-on label 5B | text |
| Add-on label 6A | text |
| Add-on label 6B | text |
| Collection | text |
| Label A | text |
| Label B | text |
| Price | number |
| Product Name | text |
| SKU | text |
| Status | text |
| Type | text |
| Creator | User (built-in) |
| Modified Date | date (built-in) |
| Created Date | date (built-in) |
| Slug | text (built-in) |

Status: likely legacy or incomplete, but usage and record counts must be checked
before exclusion.

### Announcement

| Field | Bubble type |
|---|---|
| annoncement | text |
| Creator | User (built-in) |
| Modified Date | date (built-in) |
| Created Date | date (built-in) |
| Slug | text (built-in) |

The original misspelling `annoncement` must remain traceable in migration
mapping.

### DS_driver Assign Remind

| Field | Bubble type |
|---|---|
| contact no. | number |
| Name | text |
| remind time | date |
| Creator | User (built-in) |
| Modified Date | date (built-in) |
| Created Date | date (built-in) |
| Slug | text (built-in) |

Migration note: map `contact no.` to text rather than numeric storage so leading
zeroes, country prefixes, and formatting are not lost.

### Font

| Field | Bubble type |
|---|---|
| Bold | file |
| Bold1 | file |
| Regular | file |
| Regular1 | file |
| Creator | User (built-in) |
| Modified Date | date (built-in) |
| Created Date | date (built-in) |
| Slug | text (built-in) |

Likely used by PDF, label, or print workflows. Font binaries should move to
private Supabase Storage where appropriate, with metadata storing object paths.

### User

| Field | Bubble type |
|---|---|
| available_pages | List of texts |
| Customer | A_Customers |
| Email_Noti | yes / no |
| factory panel date | date |
| pw | text |
| Role | OS User Role |
| shop restro | SHOP DS Restro |
| User Name | text |
| week | text |
| week+1 | text |
| week+2 | text |
| email | text (built-in) |
| Modified Date | date (built-in) |
| Created Date | date (built-in) |
| Slug | text (built-in) |

Security and migration notes:

- Never migrate, return, log, or preserve `pw`.
- Use Supabase Auth for credentials and password resets.
- Normalize roles and page permissions rather than trusting editable user
  metadata.
- Convert `Customer` and `shop restro` references to UUID foreign keys while
  preserving Bubble legacy IDs for reconciliation.

## Privacy Rules Captured

### User

Three rules are configured.

#### Rule: `sup_admin`

- Condition: `Current User's Role is Super Admin or Current User's Role is Admin`
- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: enabled for five fields:
  - `Email_Noti`
  - `pw`
  - `Role`
  - `shop restro`
  - `User Name`
- API controls: not shown for this User privacy rule

#### Rule: `User's own data`

- Condition: `This User is Current User`
- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: enabled for four fields:
  - `Email_Noti`
  - `factory panel date`
  - `pw`
  - `User Name`
- API controls: not shown for this User privacy rule

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- View access: `Role`, `User Name`, and `email`
- Constraint access: `Role`, `User Name`, `email`, and `Slug`
- Auto-bind: disabled for all fields
- API controls: not shown for this User privacy rule

Critical security observations:

- Product owner confirmed on 2026-08-12 that the custom `pw` field is actively
  used for login.
- Anonymous users can search the User type and read every user's role, name, and
  email address.
- Admin/Super Admin users can Auto-bind role and restaurant assignment without
  an explicit audited role-management workflow.
- Every user can Auto-bind the custom `pw` text field on their own record, and
  Admin/Super Admin can Auto-bind it on other users.
- The custom `pw` field must never be migrated, logged, returned, or retained.
- `available_pages` is readable to Admin/Super Admin and the user themself but
  is not Auto-bindable under the captured rules.

Supabase migration requirements:

- Use Supabase Auth for credentials, invitations, and password reset.
- Deny anonymous user-directory access.
- Restrict profile reads to self plus explicit administrative/business scopes.
- Manage role, permissions, customer, and restaurant memberships through
  validated server-side administration with immutable audit history and session
  revocation after privilege changes.
- Do not trust user-editable metadata for authorization.

### A_Order

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled on **33** fields

Exact Auto-bind fields extracted from the Bubble HTML:

1. `ORDER_折扣(-)` (number)
2. `ORDER_運費(+)` (number)
3. `ORDER_購買Cashdollar` (number)
4. `ORDER_扣除Cashdollar` (number)
5. `(Quote) Asana link` (text)
6. `(Quote) Communication Channels` (DS Commu Channels (quote))
7. `(Quote) delivery text` (DS_quote_delivery)
8. `(Quote) discount text` (text)
9. `(Quote) Source of Sales` (DS Source of sales (quote))
10. `(Quote) Status` (OS Quote Status)
11. `ORDER_Channel` (DS_Channel)
12. `ORDER_Contact Number A` (text)
13. `ORDER_Contact Number B` (text)
14. `ORDER_Customer Name` (text)
15. `ORDER_Customer Note` (text)
16. `Delivery_Date` (date)
17. `Delivery_Time` (text)
18. `Delivery_District` (text)
19. `Delivery_DS_Shipping Method` (DS_Shipping Method)
20. `ORDER_Email Address` (text)
21. `ORDER_Grand total` (number)
22. `ORDER_Company Name` (text)
23. `ORDER_Order Number` (text)
24. `ORDER_Remarks` (text)
25. `Delivery_Status` (OS Delivery Status)
26. `Factory_Packing Note` (text)
27. `(Quote)_description` (text)
28. `(Quote)_STAGE` (text)
29. `Sales Partner` (DS_Sales Partner)
30. `Delivery_Ship Out Time` (text)
31. `Shipping Address` (text)
32. `ORDER_Status` (List of DS_Statuses)
33. `Factory_UnNotifyFactory` (yes / no)

The pasted HTML contains all 64 configurable Privacy fields: 33 Auto-bind
enabled, 27 disabled, and four built-in fields that are not Auto-bindable.
Swagger reports a 65th field, `_id`, which is Bubble's system record/Unique ID
and is not shown as a configurable Privacy field. The HTML is therefore
complete and was not truncated.

The rule name `11` is only a Bubble rule label. It does not indicate priority,
role, or permission level.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

The screenshots cover the complete A_Order field set already represented by
the Swagger schema. This includes customer names, telephone numbers, email,
shipping address, notes, quote/order status, delivery and factory fields,
financial totals, tags, channels, reminders, and parent/reference identifiers.

Critical security observation: the fallback rule makes every order field and
attached file anonymously searchable and readable. This exposes PII, addresses,
commercial notes, operational status, and financial values. Any authenticated
user can also Auto-bind 33 fields without a role, customer, company, shop, or
assignment condition. Neither behavior should be copied to Supabase.

Migration requirement: RLS must authorize orders by explicit role and business
scope (company/customer/site/assignment), child records must inherit parent
order access, sensitive columns need narrower grants, and all writes must pass
validated server-side transitions rather than generic client Auto-bind.

### A_Products

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled on **14** fields

Exact Auto-bind fields:

1. `Active` (yes / no)
2. `bento_main dish` (bento_main type)
3. `bento_main ingre` (List of bento_main ingredientses)
4. `bento_no. of column` (bento_number of column)
5. `bento_special request` (List of bento_special requests)
6. `R_Channel` (DS_Channel)
7. `DS CookType` (DS_CookType)
8. `Price` (number)
9. `PriceRange_Max` (number)
10. `PriceRange_Min` (number)
11. `Product Name` (text)
12. `R_Collections` (List of DS_Collections)
13. `Status` (OS Status)
14. `R_Type` (DS_Type)

Fields visible but not Auto-bindable under this rule include
`bento_recommend`, `Chinese Name`, `Description`, `Image`, `R_Ingredients`,
`R_Label`, `R_Tags`, and `SKU`.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: product data is effectively public-read, including
inactive/status fields, price ranges, ingredient/product relationships, tags,
and images. More critically, every authenticated user can Auto-bind pricing,
status, active state, categorization, and bento configuration without a role
condition. Supabase must separate public catalogue fields from internal product
configuration and restrict writes to explicitly authorized product managers.

### Announcement

Two rules are configured.

#### Rule: `1`

- Condition: `Current User is not empty`
- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: enabled for `annoncement`
- API controls: not shown in the supplied screenshot

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: enabled for `annoncement`
- API controls: not shown in the supplied screenshot

Built-in `Created Date`, `Modified Date`, `Slug`, and `Created By` fields are
viewable and usable as constraints but are not Auto-bindable.

Security observation: both authenticated and anonymous users can search, read,
and Auto-bind the announcement text. The authenticated rule adds no effective
restriction over the fallback. If an auto-bound editor is reachable, anonymous
users may be able to change announcements. Supabase should expose announcement
reads only to the intended audience and restrict writes to an explicit
administrator/content-manager role.

### B_ads Cost Weekly

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `ads cost amount` and `Remark`

Other business fields are `Ads_type` (DS_cost_type), `Channel` (DS_Channel),
`Date_range(mon to sun)` (date range), `dateText_forSorting` (number), and
`RangeStart` (date).

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: weekly advertising costs, channels, date ranges, and
remarks are anonymously searchable and readable. Any authenticated user can
Auto-bind the cost amount and remark without an accounting or marketing-role
condition. Supabase should restrict financial reads and writes to explicitly
authorized scopes and preserve changes in an audit trail.

### B_cost Monthly

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Festival amount`, `Non-Peak Amount`, and `Remark`

Other business fields are `Ads_single Brand` (DS_Channel), `cost_type`
(DS_cost_type), `Channels` (List of DS_Channels), `Festival` (DS_Festival),
`Festival Range` (date range), `Month` (date), and `OS season` (OS Season).

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: monthly costs, brands/channels, seasonal amounts, date
ranges, and remarks are anonymously readable. Every authenticated user can
Auto-bind festival and non-peak amounts without a finance role or approval
flow. Supabase should restrict financial access, validate period changes, and
audit all amount modifications.

### B_delivery Schedule

Two rules are configured.

#### Rule: `bind`

- Condition: `This B_delivery schedule's A_order is not empty`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Business fields include `A_order`, district delivery fee, delivery date/time,
delivery district, motorcade and sub-driver, fulfilment/take timestamps, image
attachments, driver confirmation and delivery status, ship-out time, and total
delivery surcharge.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: both rules grant the same read permissions, so the
`A_order is not empty` condition has no effective access-control value. All
delivery schedules, linked order references, driver assignments, timestamps,
fees, statuses, and images are anonymously searchable and readable. Supabase
must authorize schedule rows through the parent order and assigned driver, with
delivery images stored privately.

### B_supplierPurchase

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Amount`

Other business fields are `Date`, `DS_purchase_type` (DS_Purchase Type), and
`Supplier` (DS__ingredient_Supplier).

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: supplier purchase amounts, dates, types, and supplier
relationships are anonymously searchable and readable. Every authenticated
user can Auto-bind the purchase amount without a purchasing/accounting role or
approval condition. Supabase should scope purchasing records by legal entity
and site, restrict financial writes, and preserve an approval/audit history.

### DS Reminder Person(First)

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `hrs`, `name`, and `phone no.`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security and migration observations: reminder contact names, telephone numbers,
and reminder-hour values are anonymously searchable and readable. Every
authenticated user can modify all three business fields without a role
condition. `phone no.` is stored as a Bubble number and must be migrated to text
to preserve leading zeroes, country prefixes, and formatting. Supabase access
should be limited to authorized follow-up/operations staff.

### DS Reminder Person(Second)

This type uses the same two-rule pattern as `DS Reminder Person(First)`.

- `bind` condition: `Current User is logged in`
- `bind` Auto-bind fields: `hrs`, `name`, and `phone.no`
- `Everyone else`: all fields anonymously searchable/readable, no Auto-bind
- Both rules: attached files viewable, all fields viewable/usable as
  constraints, and API Create/Delete/Modify disabled

Security and migration observations are identical to the first-reminder type:
contact data is publicly readable and every authenticated user can modify all
business fields. `phone.no` must be migrated from number to text, and access
must be restricted to authorized follow-up/operations staff.

### DS__ingredient_Supplier

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all seven business fields:
  - `Active`
  - `comment`
  - `Company name`
  - `Contact person`
  - `deliver_schedule`
  - `payment_schedule`
  - `Phone no.`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: supplier company/contact details, telephone number,
comments, delivery schedule, and payment schedule are anonymously searchable
and readable. Every authenticated user can modify every business field without
a purchasing role or supplier-management scope. Supabase should restrict reads
and writes to authorized purchasing/operations users and audit supplier master
changes. `Phone no.` is already text and should remain text.

### DS_CookType

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Type` and `WorkloadScore`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: cook types and workload scores are anonymously
searchable/readable, while every authenticated user can modify both values
without a production-management role. Supabase should permit public/internal
reference reads only where required and restrict workload configuration writes
to authorized production administrators with audit history.

### DS_cost_type

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all four business fields: `Active`, `ads`,
  `cost_type`, and `brand`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: cost-type configuration and its advertising/brand flags
are anonymously readable. Every authenticated user can modify all business
fields without an accounting or configuration-management role. Supabase should
restrict changes to authorized finance administrators and preserve an audit
history because these values classify downstream cost records.

### DS_customer_tag

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all three business fields: `Active`,
  `DS_customer_tag_type`, and `tag`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: customer-tag definitions and their category relationship
are anonymously readable, while every authenticated user can change active
state, type, and label without a CRM-management role. Supabase should allow
catalogue reads only where needed and restrict taxonomy changes to authorized
CRM/marketing administrators with audit history.

### DS_customer_tag_type

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active` and `customer tag type`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: customer-tag category definitions are anonymously
readable and every authenticated user can modify active state and category name.
Supabase should restrict taxonomy writes to authorized CRM/marketing
administrators and audit changes.

### DS_delivery District

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `DeliveryFee`, `District`, and `Driver teams`
  (DS_Super_Motorcade)

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: delivery districts, fees, and assigned driver teams are
anonymously readable, and every authenticated user can modify all three fields.
Supabase should restrict routing/fee configuration writes to authorized
operations administrators and audit fee or assignment changes.

### DS_delivery Surcharge

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `charge_name`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: delivery surcharge names and active state are anonymously
readable, and every authenticated user can modify both fields. Supabase should
restrict surcharge configuration changes to authorized operations/pricing
administrators and audit them.

### DS_driver Assign Remind

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: enabled for `contact no.`, `Name`, and `remind time`
- API controls: not legible in the supplied overview screenshot

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields
- API controls: not legible in the supplied overview screenshot

Security and migration observations: driver reminder contact details and times
are anonymously readable, while every authenticated user can modify every
business field. `contact no.` is numeric and must migrate to text. Supabase
should restrict this data to authorized dispatch/operations users and audit
reminder changes.

### DS_Festival

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active` and `Festival`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: festival definitions are anonymously readable, while
every authenticated user can modify their name and active state. Because these
values feed pricing, cost, and reporting periods, Supabase should restrict
writes to authorized operations/finance configuration administrators and audit
changes.

### DS_Ingredients

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled on **12** business fields:
  - `食材盤點`
  - `包裝盤點`
  - `Active`
  - `cost/stockTakeUnit`
  - `Description`
  - `Display Name`
  - `productQ`
  - `ProductUnit`
  - `SKU`
  - `Supplier`
  - `Type`
  - `StockTakeUnit`
- `cost/ProductUnit` is visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: ingredient names, SKUs, supplier relationships, unit
configuration, quantities, and both cost fields are anonymously readable.
Every authenticated user can modify nearly all inventory configuration,
including stocktake cost/unit data, supplier, SKU, and quantity, without a
warehouse or production role. Supabase should separate public catalogue data
from internal cost/inventory data and restrict writes to authorized inventory
administrators with audit history.

### DS_Payment Method

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `Method Name`
- `Paypal ID` (yes/no) is visible but not Auto-bindable

The rule label `11` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: payment-method configuration, including the PayPal flag,
is anonymously readable, while every authenticated user can modify active state
and method name. Supabase should restrict payment configuration changes to
authorized finance administrators and audit them.

### DS_Purchase Type

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active` and `Type`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: purchase-type configuration is anonymously readable and
every authenticated user can modify its name and active state. Supabase should
restrict purchasing taxonomy changes to authorized purchasing/finance
administrators and audit them.

### DS Sales Partner

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `Name`, and `Phone no.`

The rule label `11` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: sales-partner names, telephone numbers, and active state
are anonymously readable, and every authenticated user can modify all three
fields without a sales/CRM-management role. Supabase should restrict contact
data to intended staff, restrict writes to authorized CRM administrators, and
audit changes. `Phone no.` is text and should remain text.

### DS Shipping Method

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for four fields:
  - `active`
  - `Address check`
  - `Display Name`
  - `Display Order`

Other visible fields are `^_^`, `editable`, `factory display`, and `Real_Name`.
The rule label `11` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Address check` and `Display Name`

Critical security observation: this fallback rule grants anonymous write
capability through Auto-bind for two shipping-method fields. Anonymous users can
also read every field, while every authenticated user can additionally change
active state and display order. Supabase must not copy this behavior; shipping
method configuration should be writable only by authorized operations
administrators through validated, audited actions.

### DS_Status

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is not empty`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `color` and `follow up`

Other business fields are `Display Name`, `editable`, and `order`. The rule
label `11` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `color`

Critical security observation: status definitions are anonymously readable and
the fallback grants anonymous Auto-bind access to `color`. Every authenticated
user can additionally change the follow-up flag. Supabase must restrict status
configuration to authorized workflow administrators and audit all changes.

### DS_Super_Motorcade

Two rules are configured.

#### Rule: `1`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all eight business fields:
  - `contact no.` (number)
  - `Contact person`
  - `driver_panel`
  - `Full Name`
  - `Login_code`
  - `One Word`
  - `payment method(text)`
  - `Status` (OS Status)

The rule label `1` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: driver contact details, status, payment-method
text, and `Login_code` are anonymously searchable and readable. Every
authenticated user can modify every business field. `Login_code` must not be
migrated as readable authentication data; driver authentication must use
Supabase Auth or another secure identity flow. `contact no.` must migrate from
number to text. Driver records should be restricted to authorized dispatch
staff and the driver's own permitted profile fields.

### M_customer

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `address`, `contact person`, `fone`, and `Name`
- `cust_code` and `DN_needed` are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: customer names, addresses, contact persons,
telephone numbers, customer codes, and delivery-note requirements are
anonymously searchable and readable. Every authenticated user can modify core
customer contact details without ownership or role conditions. Supabase must
restrict customer access by authorized organization/customer scope, mask PII
where appropriate, and route master-data changes through validated, audited
actions. `fone` is text and should remain text.

### M_doneMeat

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `Name`, and `sort_order`
- `kg/包`, `Name_Eng`, `raw_meat`, `SKU`, and `Unit` are visible but not
  Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: processed-meat master data, SKU, unit conversion, and raw
meat relationships are anonymously readable. Every authenticated user can
modify active state, name, and sort order. Supabase should restrict production
master-data writes to authorized meat-production/inventory administrators and
audit changes.

### M_doneMeat_stock

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `in/包` and `remark`

Other business fields are `Date`, `DoneMeat`, `DoneMeat_order`,
`from_rawStock`, `from_rawStock_list`, `M_outDone_doneMeat`, `out/包`, and
`Shop_M_cust`.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: processed-meat stock movements, quantities, source-stock
relationships, outbound records, and customer/shop relationships are
anonymously readable. Every authenticated user can modify inbound package
quantity and remarks without warehouse scope. Supabase should protect stock
movements by warehouse/site and permit quantity changes only through validated,
audited inventory transactions.

### M_outDone_doneMeat

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `quantity`, `remarks`, and `sortNo`
- `M_doneMeat`, `M_outDone_order`, and `M_rawMeat` relationships are visible
  but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: outbound processed-meat line quantities, remarks, sort
order, and raw/processed meat relationships are anonymously readable. Every
authenticated user can modify quantities without warehouse or document-state
authorization. Supabase should authorize rows through the parent outbound
document and permit quantity changes only through validated, audited inventory
transactions.

### M_outDone_order

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for five fields:
  - `M_cust`
  - `orderDate`
  - `remarks`
  - `shippingMethod`
  - `shippingDate`
- `orderNumber`, `printdate`, `send to factory`, and `senddate` are visible but
  not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: outbound order/customer relationships, order numbers,
dates, factory-send state, shipping method, and remarks are anonymously
readable. Every authenticated user can reassign the customer and alter order or
shipping details without role or document-state authorization. Supabase should
scope access by customer/site and enforce validated, audited status transitions.

### M_raw_stock

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Remarks`

Other visible fields include applied markup/seasoning calculations, date,
inbound price and quantity, total amount, supplier, outbound quantity and
relationships, raw meat, raw-meat order, and related inbound stock records.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: raw-stock prices, costs, markups, supplier
relationships, quantities, totals, and movement relationships are anonymously
readable. Every authenticated user can modify remarks. Supabase must restrict
cost data to authorized finance/inventory roles, scope stock by owner and
warehouse, and represent quantity changes as validated, immutable/audited
inventory movements.

### M_rawMeat

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active`, `CanOut_directly`, `name`, and `sort_order`

Other visible fields include `Curr_Markup`, `curr_seasoning_code`,
`curr_variation`, `current_seasoning_cost`, `name_Eng`, `SKU`, `Supplier`, and
`Unit`.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: raw-meat markup, seasoning cost/calculation,
supplier relationships, SKU, and unit data are anonymously readable. Every
authenticated user can change active/direct-out flags, name, and sort order.
Supabase should restrict cost fields to finance/production roles and master-data
writes to authorized meat-production administrators with audit history.

### M_seasoning

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `calculate_expression`, `cost/g`, `description`, and
  `sort`
- `LastUpdate` and `name` are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: seasoning formulas, cost per gram, descriptions,
names, and update dates are anonymously readable. Every authenticated user can
modify the calculation expression and cost, potentially changing downstream
production costing. Supabase should treat formulas as versioned configuration,
restrict writes to authorized production/finance administrators, validate
expressions, and audit every change.

### NOS_order Tag

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `Display`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: order-tag definitions are anonymously readable, and
every authenticated user can modify active state and display text. Supabase
should restrict order taxonomy writes to authorized operations administrators
and audit changes.

### S_ingredient_stocktake

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Quantity`
- `active ingredient` (DS_Ingredients), `SKU`, and `stocktake Date` are visible
  but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: ingredient stocktake quantities, SKU, ingredient
relationships, and dates are anonymously readable. Every authenticated user can
modify counted quantity without warehouse, stocktake-session, or approval
scope. Supabase should authorize stocktakes by site/warehouse and permit
quantity entry only within an open assigned stocktake, with submit/review locks
and full audit history.

### S_Ingredients_Product

Two rules are configured.

#### Rule: `hello`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Quantity`
- `Ingredients` (DS_Ingredients), `Package` (A_Packages), `Product`
  (A_Products), and `test` are visible but not Auto-bindable

The rule label `hello` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: product/package ingredient relationships and
recipe quantities are anonymously readable. Every authenticated user can alter
ingredient quantity without product-management authorization. Supabase should
restrict recipe/BOM reads where commercially sensitive and permit changes only
to authorized product/production managers through versioned, audited recipes.

### S_Order

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for seven fields:
  - `Item order`
  - `newproductname`
  - `Product`
  - `Quantity`
  - `remarks2`
  - `remarks1`
  - `Unit Price`

Other visible fields include add-on/converted/printed/send-to-factory/void
flags, deletion date, parent `Order`, `Package`, SKU, total price, type sort,
free-form quantity/content, and audit metadata. The rule label `11` has no
authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for six fields:
  - `Item order`
  - `Product`
  - `Quantity`
  - `remarks2`
  - `remarks1`
  - `Unit Price`

Critical security observation: anonymous users can search/read every order-line
field and can Auto-bind product, quantity, unit price, remarks, and item order.
This permits anonymous modification of commercially and financially significant
order details if an auto-bound UI is reachable. Supabase must authorize lines
through the parent order, prohibit anonymous writes, calculate totals
server-side, and enforce document-state/role checks with an immutable audit
trail.

### S_Packages_ChoiceSet

Two rules are configured.

#### Rule: `hello`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Max Number` and `RealType`
- `Package`, `Product`, `RealTypeName`, and `Type` relationships/fields are
  visible but not Auto-bindable

The rule label `hello` has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: package choice-set limits, product composition, and type
relationships are anonymously readable. Every authenticated user can modify
maximum selection count and real-type text without product-management
authorization. Supabase should restrict package configuration writes to
authorized product managers and version/audit menu changes.

### S_Packing_Stocktake

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Quantity`
- `packing_DS_ing` (DS_Ingredients), `SKU`, and `Stocktake Date` are visible
  but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: packing stocktake quantities, SKUs, ingredient
relationships, and dates are anonymously readable. Every authenticated user can
modify counted quantity without site/warehouse or stocktake-session scope.
Supabase should authorize by assigned stocktake and warehouse, then lock and
audit submitted counts.

### S_Payment

Two rules are configured.

#### Rule: `11`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `Amount`

Other visible fields are `Channels`, parent `Order`, `OrderNo.`, `Payment Date`,
`Payment Method`, `Paypal ID`, `Rec`, and `Payout date`. The rule label `11`
has no authorization meaning.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Amount`

Critical security observation: payment amounts, order relationships/numbers,
payment dates/methods, PayPal identifiers, receipt text, and payout dates are
anonymously readable. The fallback also permits anonymous Auto-bind changes to
`Amount`, creating a direct financial-integrity risk. Supabase must deny
anonymous access, restrict payment data to authorized accounting scopes, and
allow amount changes only through validated posting/reversal workflows with
immutable audit records.

### S_Payment Report

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for four fields:
  - `Charges`
  - `Invoice no.`
  - `Payout date`
  - `Rec no.`
- `Channels`, `Net Amount`, `Payment Method`, `S_payment`, and `total amount`
  are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: invoices, receipts, charges, net/total amounts,
payout dates, channels, payment methods, and linked payments are anonymously
readable. Every authenticated user can alter invoice/receipt references,
charges, and payout date without accounting authorization. Supabase must deny
anonymous access and restrict edits to validated accounting reconciliation
workflows with immutable audit records.

### SHOP DS Restro

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `Name`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: appears disabled in the supplied screenshot
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant/shop identifiers, names, and active state are
anonymously readable, and every authenticated user can modify name and active
state without shop-management authorization. Supabase should allow reference
reads only where required and restrict shop master-data changes to authorized
system/restaurant administrators with audit history.

### SHOP DS_Purchase Type

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active`, `purchase type`, and `Sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant purchase-type names, active state, and sort
order are anonymously readable, and every authenticated user can modify all
business fields. Supabase should restrict restaurant purchasing taxonomy
changes to authorized restaurant/purchasing administrators and audit them.

### SHOP_dailySales

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for six fields:
  - `amount`
  - `pettyCash_amount`
  - `quantity`
  - `Realcash_count_amount`
  - `Remarks`
  - `Working Hour`

Other visible fields include average sales per working hour, control/real-cash
flags, date, POS sheet image, manager-hour department, petty-cash flag,
restaurant, new product, payment method, department, time period, delivery
platform, and sort order.

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: restaurant sales, cash counts, petty cash,
working hours, POS images, payment methods, departments, and platform data are
anonymously readable. Every authenticated user can modify core reported
amounts, quantities, cash counts, and working hours. Supabase must deny
anonymous access, scope records to the restaurant/department/business date, and
require cashier entry plus manager/accounting review with immutable audit
history.

### SHOP_DS Cost

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `cost name`
- `Cost Type`, `report_staff cost`, and `sort_order` are visible but not
  Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant cost definitions, staff-report flag, type, and
sort order are anonymously readable. Every authenticated user can modify active
state and cost name without finance/restaurant configuration authorization.
Supabase should restrict cost taxonomy writes to authorized restaurant/finance
administrators and audit changes.

### SHOP_DS Cost_type

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `sort_order`
- `Cost Type` is visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant cost-type names and sort order are anonymously
readable, while every authenticated user can change ordering without a
configuration-management role. Supabase should restrict taxonomy ordering to
authorized restaurant/finance administrators and audit changes.

### SHOP_DS Payment Method

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all four business fields:
  - `扣零用金`
  - `active`
  - `Shop_payment method`
  - `sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant payment-method names, active state, petty-cash
deduction behavior, and sort order are anonymously readable. Every authenticated
user can modify all business fields, including the petty-cash accounting flag.
Supabase should restrict payment configuration to authorized restaurant/finance
administrators and audit changes.

### SHOP_DS Restro_period

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `period name`, and `sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: appears disabled in the supplied screenshot
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant reporting-period names, active state, and sort
order are anonymously readable, and every authenticated user can modify all
business fields. Supabase should restrict period configuration to authorized
restaurant/finance administrators and audit changes because downstream reports
depend on it.

### SHOP_DS_holiday

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active` and `sort`
- `holiday` is visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: holiday definitions, active state, and order are
anonymously readable, while every authenticated user can activate/deactivate or
reorder holidays. Supabase should restrict holiday calendar configuration to
authorized restaurant/operations administrators and audit changes.

### SHOP_DS_new_product

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all four business fields:
  - `active`
  - `new_product_name`
  - `remarks`
  - `remarks_placeholder`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant new-product definitions and remark behavior
are anonymously readable, while every authenticated user can modify all
business fields. Supabase should restrict product-entry configuration to
authorized restaurant/product administrators and audit changes.

### SHOP_DS_restro_depart

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `depart_name`, and `sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant department names, active state, and sort order
are anonymously readable, while every authenticated user can modify all
business fields. Supabase should restrict department master-data writes to
authorized restaurant/system administrators and audit changes.

### SHOP_DS_staff_list

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for six fields:
  - `active`
  - `Full / Part time`
  - `Name`
  - `restro`
  - `restro depart`
  - `sort`
- `phone no.` is visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: staff names, telephone numbers, employment type,
restaurant and department assignments are anonymously readable. Every
authenticated user can alter staff identity/status and assignments without HR
or restaurant-management authorization. Supabase must deny public access,
restrict staff data by management scope, and audit all assignment/status
changes. `phone no.` is text and should remain text.

### SHOP_DS_time_slot

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `restro period`, `Slot`, and `sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: restaurant time-slot configuration and period
relationships are anonymously readable, while every authenticated user can
modify all business fields. Supabase should restrict scheduling configuration
to authorized restaurant administrators and audit changes.

### SHOP_food_deli_platform

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `active`, `platform_name`, and `sort`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: food-delivery platform definitions are anonymously
readable, while every authenticated user can modify all business fields.
Supabase should restrict platform configuration to authorized
restaurant/channel administrators and audit changes.

### SHOP_Ingredients

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for all six business fields:
  - `active`
  - `cost/Unit`
  - `Display Name`
  - `shop_depart`
  - `Supplier`
  - `unit`

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: restaurant ingredient costs, suppliers, units,
department assignments, and active state are anonymously readable. Every
authenticated user can modify all business fields, including cost and supplier.
Supabase must restrict cost visibility and master-data writes to authorized
restaurant/inventory/finance roles and audit changes.

### SHOP_monthly_cost

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `amount` and `Remarks`
- `Can_proceed_PNL`, `cost`, `Cost_type`, `cost_type_sort`, `month`, and
  `Restro` are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: restaurant monthly cost amounts, P&L readiness,
cost types, month, remarks, and restaurant relationship are anonymously
readable. Every authenticated user can modify amount and remarks without
restaurant/accounting scope. Supabase must deny anonymous access, scope costs
by restaurant/legal entity/period, and restrict edits to audited accounting
workflows.

### SHOP_StockTake

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `quantity` and `unit cost`
- Department, ingredient, restaurant, stock date, supplier, and `total_cost`
  are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: restaurant stocktake quantities, unit/total
costs, supplier, ingredient, department, restaurant, and dates are anonymously
readable. Every authenticated user can modify counted quantity and unit cost.
Supabase must deny anonymous access, scope stocktakes by restaurant/department,
and permit quantity/cost entry only within assigned, open stocktakes with
manager/accounting review and audit history.

### SHOP_supplier_purchase

Two rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled only for `amount`
- `date`, `Restro`, `supplier`, and `type` are visible but not Auto-bindable

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Critical security observation: restaurant supplier-purchase amounts, dates,
restaurant, supplier, and type are anonymously readable. Every authenticated
user can modify purchase amount without restaurant/purchasing/accounting scope.
Supabase must deny anonymous access, scope purchases by restaurant/legal entity,
and restrict amount changes to validated, audited purchasing workflows.

### A_Label

Two rules are configured.

#### Rule: `1`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

#### Rule: `Everyone else`

- Find this in searches: enabled
- View files attached to this: disabled
- Create, Delete, and Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Fields shown:

- `Display Name B` (text)
- `Display Name A` (text)
- `Packing` (DS_Packing)
- `Product` (A_Products)
- `Created Date` (date)
- `Modified Date` (date)
- `Slug` (text)
- `Created By` (User)

Security observation: all fields and relationships are anonymously searchable
and readable. Authentication changes only attached-file visibility. The type is
effectively public-read despite being labelled as having Privacy Rules.

### DS Commu Channels (Quote)

Two Bubble Privacy Rules are configured.

#### Rule: `bind`

- Condition: `Current User is logged in`
- Find this in searches: enabled
- View files attached to this: enabled
- Create via API: disabled
- Delete via API: disabled
- Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: enabled for `Active` and `Channels`

Fields shown:

- `Active` (yes / no)
- `Channels` (text)
- `Created Date` (date)
- `Modified Date` (date)
- `Slug` (text)
- `Created By` (User)

#### Rule: `Everyone else`

- Applies when the authenticated `bind` rule does not match
- Find this in searches: enabled
- View files attached to this: enabled
- Create via API: disabled
- Delete via API: disabled
- Modify via API: disabled
- View and constraint access: all fields
- Auto-bind: disabled for all fields

Security observation: anonymous users can search and read every field because
the fallback rule grants search and field visibility. Although Bubble labels
this type as having Privacy Rules, its effective read access is public.

### Remaining quote reference and junction types

The following eight types use the same two-rule pattern as
`DS Commu Channels (Quote)`:

- `bind` when `Current User is logged in`
- `Everyone else` as the fallback
- both rules allow finding records in searches, viewing attached files, and
  viewing/constraining every field
- both rules disable Create, Delete, and Modify via API
- the authenticated rule permits Auto-bind only on the fields listed below
- the fallback rule permits no Auto-bind

| Data type | Business fields | Authenticated Auto-bind |
|---|---|---|
| DS Source Of Sales (Quote) | `Active` (yes/no), `Source` (text) | `Active`, `Source` |
| DS_quote_delivery | `display` (text) | `display` |
| DS_quote_payment | `display` (text), `editable` (yes/no) | `display` |
| DS_quote_T&C | `display` (text), `editable` (yes/no) | `display` |
| Quote_bento_additional Item | `A_order` (A_Order), `additional item` (text), `DS_addiction item ID` (DS_bento_additional item), `sort` (number) | `additional item`, `sort` |
| Quote_bento_event Part | `A_order` (A_Order), `ds_bento_event item` (DS_bento_event part), `quote_event item` (text), `quote item_price` (number), `sort` (number) | `quote_event item`, `quote item_price`, `sort` |
| Quote_payment Method | `A_order` (A_Order), `method` (text) | `method` |
| Quote_T&C | `A_order` (A_Order), `T&C` (text) | `T&C` |

Each type also exposes Bubble's built-in `Created Date`, `Modified Date`, `Slug`,
and `Created By` fields for viewing and constraints. Built-in fields are not
Auto-bindable.

Security observation: all eight types are effectively public-read because the
`Everyone else` rule exposes search and every field. The `A_order` relations on
the junction types can disclose order identifiers or relationship structure
even when the parent order has stronger Privacy Rules. Supabase migration
should therefore authorize these child records through their parent order
rather than copy the anonymous fallback access.

### Quote_file

Bubble reports `Quote_file` as `Publicly visible` and no Privacy Rules are
configured. Anonymous read exposure should be assumed. The supplied screenshot
does not establish Data API write permissions.

Migration requirement: quote attachments must not remain globally public by
default. Store objects in a private bucket and authorize access through the
related quote/order, using short-lived signed URLs when a download is allowed.

## Outstanding Evidence

- Privacy Rules are complete for all 69 types marked `Privacy rules applied`.
- Complete Option Sets, especially `OS User Role`.
- Actual `available_pages` values and precedence relative to Role.
- Record counts and usage references for the five editor-only types.
- App Data exports for migration and reconciliation.
- Page, reusable-element, frontend workflow, backend workflow, scheduled
  workflow, plugin, and API Connector inventories.
