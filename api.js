// Talks to the CashCow server, which keeps each family's circle private:
// only signed-in members of a circle can see or change it.
import { currentToken } from "./account.js";

const API = "https://cashcow-reviews-api.onrender.com";

async function call(path, body) {
  const token = await currentToken();
  if (!token) throw Object.assign(new Error("Please sign in to your CashCow account."), { status: 401 });
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't connect. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.";
    throw Object.assign(new Error(detail), { status: res.status });
  }
  return data;
}

export const myCircles = () => call("/api/care/circles").then((d) => d.circles || []);
export const myLimits = () => call("/api/care/limits");
export const createCircle = (name, displayName) => call("/api/care/circles", { name, display_name: displayName });
export const joinCircle = (code, displayName) => call("/api/care/join", { code, display_name: displayName });
export const getCircle = (id) => call(`/api/care/circles/${id}`);
export const addItem = (id, kind, data, assignedTo) => call(`/api/care/circles/${id}/items`, { kind, data, assigned_to: assignedTo || null });
export const updateItem = (itemId, patch) => call(`/api/care/items/${itemId}/update`, patch);
export const deleteItem = (itemId) => call(`/api/care/items/${itemId}/delete`, {});
export const saveCard = (id, card) => call(`/api/care/circles/${id}/card`, { card });
export const renameCircle = (id, name) => call(`/api/care/circles/${id}/rename`, { name });
export const newCode = (id) => call(`/api/care/circles/${id}/code`, {});
export const removeMember = (id, userId) => call(`/api/care/circles/${id}/remove`, { user_id: userId });
export const leaveCircle = (id) => call(`/api/care/circles/${id}/leave`, {});
export const deleteCircle = (id) => call(`/api/care/circles/${id}/delete`, {});
