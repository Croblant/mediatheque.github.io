/* Fleches "partition precedente / suivante" sur PC (appareil sans ecran tactile).
   Sur tactile, on change de partition en glissant le doigt ; ici deux boutons de part et d'autre de la partition
   reproduisent ce geste. Ils declenchent le meme chemin que l'ancien clic sur le quart gauche/droit de #paperframe
   (gestionnaire de main.js) : aucune logique de navigation n'est dupliquee. Script classique (compatible file://). */
(function () {
    "use strict";

    function hasTouch() {
        try {
            if (window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches) return true;
        } catch (e) { /* ignore */ }
        return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
    }
    if (hasTouch()) return;

    var css = document.createElement("style");
    css.textContent =
        ".rs-nav-arrow{position:fixed;top:50%;transform:translateY(-50%);z-index:40;width:44px;height:88px;border:0;padding:0;" +
        "border-radius:10px;background:rgba(0,0,0,.18);color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;" +
        "transition:background .15s}" +
        ".rs-nav-arrow:hover,.rs-nav-arrow:focus-visible{background:rgba(0,0,0,.45);outline:none}" +
        ".rs-nav-arrow svg{width:28px;height:28px;display:block}" +
        ".rs-nav-prev{left:6px}.rs-nav-next{right:6px}" +
        "@media print{.rs-nav-arrow{display:none!important}}";
    document.head.appendChild(css);

    function make(dir) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rs-nav-arrow rs-nav-" + dir;
        var label = dir === "prev" ? "Partition précédente" : "Partition suivante";
        b.title = label;
        b.setAttribute("aria-label", label);
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
            (dir === "prev" ? "M15 4l-8 8 8 8" : "M9 4l8 8-8 8") +
            '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        b.addEventListener("click", function (ev) {
            ev.preventDefault();
            var frame = document.getElementById("paperframe");
            if (!frame) return;
            var w = document.documentElement.clientWidth || window.innerWidth;
            var x = dir === "prev" ? 4 : w - 4;
            frame.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: 200, view: window }));
            b.blur();
        });
        return b;
    }

    function visible(el) {
        return !!el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
    }

    document.addEventListener("DOMContentLoaded", function () {
        var prev = make("prev"), next = make("next");
        document.body.append(prev, next);
        function update() {
            var frame = document.getElementById("paperframe");
            var paper = document.getElementById("paper");
            var show = visible(frame) && visible(paper) && paper.querySelector("svg") !== null;
            var layer = document.getElementById("hideSettingsLayer");
            if (show && layer && visible(layer)) show = false;
            var d = show ? "flex" : "none";
            prev.style.display = d;
            next.style.display = d;
        }
        update();
        setInterval(update, 400);
        window.addEventListener("resize", update);
    });
})();
