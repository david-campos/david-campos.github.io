/**
 * @type {{link: Element, i: Element, refs: Element}[]}
 */
let links = [];

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

updateMenuIcons = function () {
    if (links.length < 1) return;

    let scrollPos = document.documentElement.scrollTop + links[0].refs.offsetTop;
    let currentTop = 0;
    links.forEach(link => {
        let bottom = link.refs.offsetTop + link.refs.offsetHeight - 20; // 20 px before
        if (scrollPos >= currentTop && scrollPos < bottom) {
            link.i.className = "material-icons";
            link.link.classList.add("current");
            window.history.replaceState(null, document.title, `#${link.refs.id}`);
        } else {
            link.i.className = "material-icons-outlined";
            link.link.classList.remove("current");
        }
        currentTop = bottom;
    });
};

scrollTo = function (element, event) {
    if (links.length < 1) return;

    event.preventDefault();
    event.stopPropagation();

    element.scrollIntoView({behavior: "smooth", inline: "start"});
};

document.addEventListener("DOMContentLoaded", function () {
    let menu = document.getElementById("menu");
    for (let link of menu.getElementsByTagName("A")) {
        let referencedElement = document.getElementById(
            link.getAttribute("href").substr(1)
        );
        if (referencedElement) {
            let i = link.getElementsByTagName("I")[0];
            links.push({
                link: link, refs: referencedElement, i: i
            });
            link.addEventListener("click", scrollTo.bind(null, referencedElement));
        }
    }
    updateMenuIcons();
});

window.addEventListener("scroll", updateMenuIcons);
window.addEventListener("resize", updateMenuIcons);
