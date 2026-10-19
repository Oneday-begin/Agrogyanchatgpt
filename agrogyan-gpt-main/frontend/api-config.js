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
        return "http://127.0.0.1:8000";
    }

    return origin.replace(/\/$/, "");
})();
