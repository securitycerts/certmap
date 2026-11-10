// The home page used to be the app itself. Links from that time (a cert, a
// roadmap, a filtered view) still arrive here, so they are handed on to the app
// at map/ with their query string and fragment intact.

const { hash, search } = location;
const appRoute = hash.startsWith("#/") && hash.length > 2;
const appQuery = /[?&](level|domain|vendor|tag|pmin|pmax|free|dod|noprereq|handson|verified|q|sel)=/.test(search);
if (appRoute || appQuery) location.replace("map/" + (appQuery ? search : "") + (appRoute ? hash : ""));
