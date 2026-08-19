import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      if (body.action !== "delete" || !body.token || !body.deliveryId || !body.url) {
        return Response.json({ error: "Invalid delete request" }, { status: 400, headers: cors });
      }
      const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const detached = await client.rpc("driver_delivery_delete_image", { p_session_token: body.token, p_delivery_id: body.deliveryId, p_image_url: body.url });
      if (detached.error) throw detached.error;
      const marker = "/object/sign/driver-delivery/";
      const path = decodeURIComponent(new URL(body.url).pathname.split(marker)[1] || "");
      if (path) await client.storage.from("driver-delivery").remove([path]);
      return Response.json({ success: true }, { headers: cors });
    }
    const form = await request.formData();
    const token = String(form.get("token") || "");
    const deliveryId = String(form.get("deliveryId") || "");
    const file = form.get("file");
    if (!token || !deliveryId || !(file instanceof File) || !file.type.startsWith("image/")) {
      return Response.json({ error: "Invalid upload" }, { status: 400, headers: cors });
    }
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const path = `${deliveryId}/${crypto.randomUUID()}.${extension}`;
    const upload = await client.storage.from("driver-delivery").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const signed = await client.storage.from("driver-delivery").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error) throw signed.error;
    const attached = await client.rpc("driver_delivery_attach_image", {
      p_session_token: token, p_delivery_id: deliveryId, p_image_url: signed.data.signedUrl,
    });
    if (attached.error) {
      await client.storage.from("driver-delivery").remove([path]);
      throw attached.error;
    }
    return Response.json({ url: signed.data.signedUrl }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400, headers: cors });
  }
});
