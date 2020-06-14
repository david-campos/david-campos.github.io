/**
 * @type {{link: Element, i: Element, refs: Element}[]}
 */
let links = [];

updateMenuIcons = function () {
    if (links.length < 1) return;

    let scrollPos = document.documentElement.scrollTop + links[0].refs.offsetTop;
    links.forEach(link => {
        let top = link.refs.offsetTop;
        let bottom = top + link.refs.offsetHeight;
        if (scrollPos >= top && scrollPos <= bottom) {
            link.i.className = "material-icons";
            link.link.classList.add("current");
        } else {
            link.i.className = "material-icons-outlined";
            link.link.classList.remove("current");
        }
    });
};

scrollTo = function (element, event) {
    if (links.length < 1) return;

    event.preventDefault();
    event.stopPropagation();

    let top = element.offsetTop - links[0].refs.offsetTop;
    window.scroll({behavior: "smooth", top: top});
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
