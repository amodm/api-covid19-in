import { Store } from "./store";
import { STORE_KEYS } from "./constants";
import { fetchTimestamps, successResponse } from "./api";

/**
 * Get various contacts as mentioned in the source origin
 */
export async function getContacts() {
    const tsPromise = fetchTimestamps();
    const contacts = await Store.get(STORE_KEYS.CONTACTS, "json");
    return successResponse({ "contacts": contacts }, tsPromise);
}