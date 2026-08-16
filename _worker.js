export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/loja\/([^/]+)\/?$/);

    if (match) {
      const destination = new URL("/loja", url.origin);
      destination.searchParams.set("id", decodeURIComponent(match[1]));
      return Response.redirect(destination.toString(), 302);
    }

    // A página /produtos foi removida: o catálogo agora vive só na home. Links
    // antigos e buscas já indexadas caem na vitrine, levando o termo buscado.
    if (/^\/produtos(\.html)?\/?$/.test(url.pathname)) {
      const home = new URL("/", url.origin);
      const term = url.searchParams.get("q");
      if (term) home.searchParams.set("q", term);
      home.hash = "produtos";
      return Response.redirect(home.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
