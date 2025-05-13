import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  console.log("AUTH SESSION:", session);

  return null;
};