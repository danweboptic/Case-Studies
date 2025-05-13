import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async () => {
  const sessions = await prisma.session.findMany();
  return json({ count: sessions.length });
};