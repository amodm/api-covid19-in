export const Store = {
    get: async (key, type='text') => COVID19.get(key, type),
    put: async (key, value) => COVID19.put(key, value)
};
