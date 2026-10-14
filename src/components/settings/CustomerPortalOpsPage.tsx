import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentPageAccess } from "@/auth/use-page-access";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/ui/list-table";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";
import "@/components/customer-portal.css";
import {
  assignPortalOpsAdmin,
  getPortalOpsMenu,
  getPortalOpsOrg,
  listPortalOpsChannels,
  listPortalOpsOrgs,
  listPortalOpsProducts,
  replacePortalOpsMenuItems,
  upsertPortalOpsMenu,
  upsertPortalOpsOrg,
  type OpsChannel,
  type OpsMenuDetail,
  type OpsMenuItem,
  type OpsOrgDetail,
  type OpsOrgListItem,
  type OpsProduct,
} from "@/lib/customer-portal-ops";

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return "operationFailed";
  const message = "message" in error ? String((error as { message?: string }).message ?? "") : "";
  if (message.includes("page_access_required")) return "accessDenied";
  if (message.includes("user_not_found")) return "userNotFound";
  if (message.includes("membership_conflict")) return "membershipConflict";
  if (message.includes("invalid_email")) return "invalidEmail";
  if (message.includes("invalid_menu_items") || message.includes("invalid_menu")) return "invalidMenu";
  return "operationFailed";
}

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function CustomerPortalOpsPage() {
  const { t } = useTranslation();
  const access = useCurrentPageAccess();
  const canEdit = access.canAccess("settings.customer_portal.edit");
  const navigate = useNavigate();
  const { orgId, menuId } = useParams<{ orgId?: string; menuId?: string }>();
  const [orgs, setOrgs] = useState<OpsOrgListItem[]>([]);
  const [org, setOrg] = useState<OpsOrgDetail | null>(null);
  const [menu, setMenu] = useState<OpsMenuDetail | null>(null);
  const [channels, setChannels] = useState<OpsChannel[]>([]);
  const [products, setProducts] = useState<OpsProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [orgPanelOpen, setOrgPanelOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgActive, setOrgActive] = useState(true);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [menuPanelOpen, setMenuPanelOpen] = useState(false);
  const [menuForm, setMenuForm] = useState({
    name: "",
    channelId: "",
    deliveryDate: "",
    deliveryTime: "12:00",
    cutoffAt: "",
    shippingFee: "0",
    isActive: true,
  });
  const [menuItems, setMenuItems] = useState<OpsMenuItem[]>([]);
  const [productId, setProductId] = useState("");

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setOrgs(await listPortalOpsOrgs());
      setChannels(await listPortalOpsChannels());
    } catch (err) {
      setError(t(`portalOps.${errorText(err)}`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadOrg = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try {
      setOrg(await getPortalOpsOrg(id));
      setChannels(await listPortalOpsChannels());
    } catch (err) {
      setError(t(`portalOps.${errorText(err)}`));
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMenu = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try {
      const detail = await getPortalOpsMenu(id);
      setMenu(detail);
      setMenuItems(detail.items);
      setProducts(await listPortalOpsProducts(detail.channel_id));
      setMenuForm({
        name: detail.name,
        channelId: detail.channel_id,
        deliveryDate: detail.delivery_date,
        deliveryTime: detail.delivery_time,
        cutoffAt: toLocalInput(detail.cutoff_at),
        shippingFee: String(detail.shipping_fee),
        isActive: detail.is_active,
      });
    } catch (err) {
      setError(t(`portalOps.${errorText(err)}`));
      setMenu(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (menuId) void loadMenu(menuId);
    else if (orgId) void loadOrg(orgId);
    else void loadOrgs();
  }, [orgId, menuId, loadOrgs, loadOrg, loadMenu]);

  async function run(action: () => Promise<void>, successKey: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      setNotice(t(`portalOps.${successKey}`));
    } catch (err) {
      setError(t(`portalOps.${errorText(err)}`));
    } finally {
      setBusy(false);
    }
  }

  function openCreateOrg() {
    setEditingOrgId(null); setOrgName(""); setOrgActive(true); setOrgPanelOpen(true);
  }
  function openEditOrg(row: OpsOrgListItem | OpsOrgDetail) {
    setEditingOrgId(row.id); setOrgName(row.name); setOrgActive(row.is_active); setOrgPanelOpen(true);
  }

  async function submitOrg(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const id = await upsertPortalOpsOrg({
        id: editingOrgId,
        name: orgName.trim(),
        isActive: orgActive,
      });
      setOrgPanelOpen(false);
      if (orgId) await loadOrg(id);
      else {
        await loadOrgs();
        navigate(`/settings/customer-portal/${id}`);
      }
    }, "saved");
  }

  async function submitAdmin(event: FormEvent) {
    event.preventDefault();
    if (!orgId) return;
    await run(async () => {
      await assignPortalOpsAdmin(orgId, adminEmail.trim());
      setAdminEmail("");
      await loadOrg(orgId);
    }, "adminAssigned");
  }

  function openCreateMenu() {
    setMenu(null);
    setMenuItems([]);
    setMenuForm({
      name: "",
      channelId: channels[0]?.id ?? "",
      deliveryDate: "",
      deliveryTime: "12:00",
      cutoffAt: "",
      shippingFee: "0",
      isActive: true,
    });
    setMenuPanelOpen(true);
    if (channels[0]?.id) void listPortalOpsProducts(channels[0].id).then(setProducts);
  }

  async function openEditMenu(id: string) {
    navigate(`/settings/customer-portal/${orgId}/menus/${id}`);
  }

  async function onChannelChange(channelId: string) {
    setMenuForm(current => ({ ...current, channelId }));
    setMenuItems([]);
    setProductId("");
    setProducts(channelId ? await listPortalOpsProducts(channelId) : []);
  }

  function addMenuItem() {
    const product = products.find(row => row.id === productId);
    if (!product || menuItems.some(row => row.product_id === product.id)) return;
    setMenuItems(current => [
      ...current,
      {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: Number(product.price ?? 0),
        available_quantity: 0,
      },
    ]);
    setProductId("");
  }

  async function submitMenu(event: FormEvent) {
    event.preventDefault();
    if (!orgId) return;
    const cutoffAt = fromLocalInput(menuForm.cutoffAt);
    if (!cutoffAt) {
      setError(t("portalOps.invalidMenu"));
      return;
    }
    await run(async () => {
      const id = await upsertPortalOpsMenu({
        id: menu?.id ?? null,
        orgId,
        channelId: menuForm.channelId,
        name: menuForm.name.trim(),
        deliveryDate: menuForm.deliveryDate,
        deliveryTime: menuForm.deliveryTime.trim(),
        cutoffAt,
        shippingFee: Number(menuForm.shippingFee) || 0,
        isActive: menuForm.isActive,
      });
      await replacePortalOpsMenuItems(
        id,
        menuItems.map(item => ({
          product_id: item.product_id,
          unit_price: Number(item.unit_price),
          available_quantity: Number(item.available_quantity),
        })),
      );
      setMenuPanelOpen(false);
      navigate(`/settings/customer-portal/${orgId}/menus/${id}`);
      await loadMenu(id);
    }, "saved");
  }

  if (menuId && menu) {
    return (
      <section className="ingredients-page customer-portal-ops">
        <header className="page-heading ingredients-heading">
          <div>
            <p><Link to={`/settings/customer-portal/${menu.organization_id}`}>{t("portalOps.backToOrg")}</Link></p>
            <h1>{menu.name}</h1>
            <p>{menu.brand} · {menu.delivery_date} · {menu.delivery_time}</p>
          </div>
          {canEdit ? (
            <Button onClick={() => { setMenuPanelOpen(true); }}>
              <Pencil /> {t("portalOps.editMenu")}
            </Button>
          ) : null}
        </header>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {loading ? <p role="status">{t("portalOps.loading")}</p> : (
          <ListTable
            className="panel"
            loading={loading}
            loadingLabel={t("portalOps.loading")}
            skeletonColumns={4}
            onRefresh={() => loadMenu(menuId!)}
            header={<tr>
                  <th>{t("portalOps.product")}</th>
                  <th>{t("portalOps.sku")}</th>
                  <th>{t("portalOps.unitPrice")}</th>
                  <th>{t("portalOps.stock")}</th>
                </tr>}
          >
                {menu.items.map(item => (
                  <tr key={item.product_id}>
                    <td>{item.name}</td>
                    <td>{item.sku || "—"}</td>
                    <td>{Number(item.unit_price).toFixed(2)}</td>
                    <td>{item.available_quantity}</td>
                  </tr>
                ))}
          </ListTable>
        )}
        {menuPanelOpen ? renderMenuPanel() : null}
      </section>
    );
  }

  if (orgId && org) {
    return (
      <section className="ingredients-page customer-portal-ops">
        <header className="page-heading ingredients-heading">
          <div>
            <p><Link to="/settings/customer-portal">{t("portalOps.backToList")}</Link></p>
            <h1>{org.name}</h1>
            <p>{org.is_active ? t("portalOps.active") : t("portalOps.inactive")}</p>
          </div>
          {canEdit ? (
            <div className="portal-ops-actions">
              <Button variant="outline" onClick={() => openEditOrg(org)}><Pencil /> {t("portalOps.editOrg")}</Button>
              <Button onClick={openCreateMenu}><Plus /> {t("portalOps.createMenu")}</Button>
            </div>
          ) : null}
        </header>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {loading ? <p role="status">{t("portalOps.loading")}</p> : (
          <>
            <h2>{t("portalOps.members")}</h2>
            <ListTable
              className="panel"
              loading={loading}
              loadingLabel={t("portalOps.loading")}
              skeletonColumns={3}
              onRefresh={() => loadOrg(orgId!)}
              header={<tr>
                    <th>{t("portalOps.email")}</th>
                    <th>{t("portalOps.role")}</th>
                    <th>{t("portalOps.status")}</th>
                  </tr>}
            >
                  {org.members.map(member => (
                    <tr key={member.user_id}>
                      <td>{member.email}</td>
                      <td>{member.role}</td>
                      <td>{member.is_active ? t("portalOps.active") : t("portalOps.inactive")}</td>
                    </tr>
                  ))}
            </ListTable>
            {canEdit ? (
              <form className="portal-ops-inline-form" onSubmit={event => void submitAdmin(event)}>
                <label>
                  {t("portalOps.assignAdmin")}
                  <input
                    required
                    type="email"
                    value={adminEmail}
                    onChange={event => setAdminEmail(event.target.value)}
                    placeholder={t("portalOps.adminEmailPlaceholder")}
                  />
                </label>
                <Button disabled={busy}>{t("portalOps.assignAdmin")}</Button>
              </form>
            ) : null}

            <h2>{t("portalOps.menus")}</h2>
            <ListTable
              className="panel"
              loading={loading}
              loadingLabel={t("portalOps.loading")}
              skeletonColumns={7}
              onRefresh={() => loadOrg(orgId!)}
              header={<tr>
                    <th>{t("portalOps.menuName")}</th>
                    <th>{t("portalOps.brand")}</th>
                    <th>{t("portalOps.delivery")}</th>
                    <th>{t("portalOps.cutoff")}</th>
                    <th>{t("portalOps.fee")}</th>
                    <th>{t("portalOps.items")}</th>
                    <th>{t("portalOps.status")}</th>
                  </tr>}
            >
                  {org.menus.map(row => (
                    <tr key={row.id}>
                      <td>
                        <button type="button" className="linkish" onClick={() => void openEditMenu(row.id)}>
                          {row.name}
                        </button>
                      </td>
                      <td>{row.brand}</td>
                      <td>{row.delivery_date} {row.delivery_time}</td>
                      <td>{new Date(row.cutoff_at).toLocaleString()}</td>
                      <td>{Number(row.shipping_fee).toFixed(2)}</td>
                      <td>{row.item_count}</td>
                      <td>{row.is_active ? t("portalOps.active") : t("portalOps.inactive")}</td>
                    </tr>
                  ))}
            </ListTable>
          </>
        )}
        {orgPanelOpen ? renderOrgPanel() : null}
        {menuPanelOpen ? renderMenuPanel() : null}
      </section>
    );
  }

  return (
    <section className="ingredients-page customer-portal-ops">
      <header className="page-heading ingredients-heading">
        <div>
          <span className="eyebrow">{t("navigation.promotion")}</span>
          <h1>{t("navigation.customerPortalOps")}</h1>
          <p>{t("portalOps.description")}</p>
        </div>
        {canEdit ? <Button onClick={openCreateOrg}><Plus /> {t("portalOps.createOrg")}</Button> : null}
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
        <ListTable
          className="panel"
          loading={loading}
          loadingLabel={t("portalOps.loading")}
          skeletonColumns={6}
          onRefresh={loadOrgs}
          header={<tr>
              <th>{t("portalOps.orgName")}</th>
              <th>{t("portalOps.admins")}</th>
              <th>{t("portalOps.members")}</th>
              <th>{t("portalOps.menus")}</th>
              <th>{t("portalOps.status")}</th>
              <th className="table-actions-cell">{t("orders.columns.actions")}</th>
            </tr>}
        >
            {!orgs.length ? <tr><td colSpan={6}>{error ? <Button variant="outline" onClick={() => void loadOrgs()}>{t("portal.retry")}</Button> : t("portalOps.noOrgs")}</td></tr> : null}
            {orgs.map(row => (
              <tr key={row.id}>
                <td>
                  <Link to={`/settings/customer-portal/${row.id}`}>{row.name}</Link>
                </td>
                <td>{row.admin_count}</td>
                <td>{row.member_count}</td>
                <td>{row.menu_count}</td>
                <td>{row.is_active ? t("portalOps.active") : t("portalOps.inactive")}</td>
                <td className="table-actions-cell">
                  {canEdit ? (
                    <Button type="button" variant="ghost" size="icon" onClick={() => openEditOrg(row)} aria-label={t("portalOps.editOrg")}>
                      <Pencil />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
        </ListTable>
      {orgPanelOpen ? renderOrgPanel() : null}
    </section>
  );

  function renderOrgPanel() {
    return (
      <SidePanel
        open={orgPanelOpen}
        onClose={() => setOrgPanelOpen(false)}
        title={editingOrgId ? t("portalOps.editOrg") : t("portalOps.createOrg")}
        closeLabel={t("portalOps.close")}
      >
        <form className="portal-ops-form" onSubmit={event => void submitOrg(event)}>
          <label>
            {t("portalOps.orgName")}
            <input required value={orgName} onChange={event => setOrgName(event.target.value)} />
          </label>
          <label className="portal-ops-switch">
            <span>{t("portalOps.active")}</span>
            <Switch checked={orgActive} onCheckedChange={setOrgActive} />
          </label>
          <Button disabled={busy || !canEdit}>{t("portalOps.save")}</Button>
        </form>
      </SidePanel>
    );
  }

  function renderMenuPanel() {
    return (
      <SidePanel
        open={menuPanelOpen}
        onClose={() => setMenuPanelOpen(false)}
        title={menu ? t("portalOps.editMenu") : t("portalOps.createMenu")}
        closeLabel={t("portalOps.close")}
        wide
      >
        <form className="portal-ops-form" onSubmit={event => void submitMenu(event)}>
          <label>
            {t("portalOps.menuName")}
            <input required value={menuForm.name} onChange={event => setMenuForm({ ...menuForm, name: event.target.value })} />
          </label>
          <label>
            {t("portalOps.brand")}
            <select
              required
              value={menuForm.channelId}
              disabled={Boolean(menu)}
              onChange={event => void onChannelChange(event.target.value)}
            >
              <option value="">{t("portalOps.chooseBrand")}</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>{channel.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t("portalOps.deliveryDate")}
            <input required type="date" value={menuForm.deliveryDate} onChange={event => setMenuForm({ ...menuForm, deliveryDate: event.target.value })} />
          </label>
          <label>
            {t("portalOps.deliveryTime")}
            <input required value={menuForm.deliveryTime} onChange={event => setMenuForm({ ...menuForm, deliveryTime: event.target.value })} />
          </label>
          <label>
            {t("portalOps.cutoff")}
            <input required type="datetime-local" value={menuForm.cutoffAt} onChange={event => setMenuForm({ ...menuForm, cutoffAt: event.target.value })} />
          </label>
          <label>
            {t("portalOps.fee")}
            <input required type="number" min={0} step="0.01" value={menuForm.shippingFee} onChange={event => setMenuForm({ ...menuForm, shippingFee: event.target.value })} />
          </label>
          <label className="portal-ops-switch">
            <span>{t("portalOps.active")}</span>
            <Switch checked={menuForm.isActive} onCheckedChange={value => setMenuForm({ ...menuForm, isActive: value })} />
          </label>

          <h3>{t("portalOps.items")}</h3>
          <div className="portal-ops-item-add">
            <select value={productId} onChange={event => setProductId(event.target.value)}>
              <option value="">{t("portalOps.chooseProduct")}</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={addMenuItem}>{t("portalOps.addItem")}</Button>
          </div>
          {menuItems.map(item => (
            <div className="portal-ops-item-row" key={item.product_id}>
              <strong>{item.name}</strong>
              <label>
                {t("portalOps.unitPrice")}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unit_price}
                  onChange={event => setMenuItems(current => current.map(row =>
                    row.product_id === item.product_id ? { ...row, unit_price: Number(event.target.value) } : row))}
                />
              </label>
              <label>
                {t("portalOps.stock")}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.available_quantity}
                  onChange={event => setMenuItems(current => current.map(row =>
                    row.product_id === item.product_id ? { ...row, available_quantity: Number(event.target.value) } : row))}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("portalOps.removeItem")}
                onClick={() => setMenuItems(current => current.filter(row => row.product_id !== item.product_id))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button disabled={busy || !canEdit || !menuForm.channelId}>{t("portalOps.save")}</Button>
        </form>
      </SidePanel>
    );
  }
}
