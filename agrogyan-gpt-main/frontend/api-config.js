window.AGRO_API_URL = (() => {
    const configured = document.documentElement?.dataset?.apiBase?.trim();
    if (configured) {
        return configured.replace(/\/$/, "");
    }

    const { protocol, hostname, origin } = window.location;
    if (protocol === "file:") {
        return "http://127.0.0.1:8000";
    }

    if (hostname === "127.0.0.1" || hostname === "localhost") {
        if (window.location.port === "8000") return origin;
        return "http://127.0.0.1:8000";
    }

    return origin.replace(/\/$/, "");
})();

// Session cookie is HttpOnly; only attach credentials to our own API.
const agroOriginalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (url.origin === new URL(window.AGRO_API_URL).origin) init = {...init, credentials: "include"};
    return agroOriginalFetch(input, init);
};
