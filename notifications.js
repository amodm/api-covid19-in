import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import { fetchTimestamps, successResponse } from "./api";

/**
 * Get notifications (title and links to documents) issued by the government
 */
export async function getNotifications() {
    const tsPromise = fetchTimestamps();
    const contacts = await Store.get(STORE_KEYS.NOTIFICATIONS, "json");
    return successResponse({ "notifications": contacts }, tsPromise);
}