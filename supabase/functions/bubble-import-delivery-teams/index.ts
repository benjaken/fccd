Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "Delivery team import is complete and disabled." }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  ),
);
