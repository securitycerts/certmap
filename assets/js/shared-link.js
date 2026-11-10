// Landing script for r/, the address shared roadmap links point at. That page
// exists so a pasted link gets a "shared roadmap" preview instead of the home
// page's; this script then hands the roadmap in the fragment over to the app.
//
//   /r/#oscp,osep?name=Red%20team   ->   /#/roadmap/oscp,osep?name=Red%20team

const payload = location.hash.slice(1);
const valid = /^[a-z0-9,-]+(\?[A-Za-z0-9%&=+_.~*-]*)?$/.test(payload);
const target = "../" + (valid ? "#/roadmap/" + payload : "");

const link = document.getElementById("open");
if (link) link.href = target;
location.replace(target);
