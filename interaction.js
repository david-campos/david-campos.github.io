/**
 * @type {{link: Element, i: Element, refs: Element}[]}
 */
let links = [];

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

const BACKGROUNDS = [
    {width: 500, height: 650, url: 'img/background_3_500.png'},
    {width: 500, height: 1000, url: 'img/background_3_500_1000.png'},
    {width: 1000, height: 650, url: 'img/background_3_1000.png'},
    {width: 1500, height: 975, url: 'img/background_3_1500.png'},
    {width: 2101, height: 1365, url: 'img/background_3.png'}
];

updateMenuIcons = function () {
    if (links.length < 1) return;

    let scrollPos = document.documentElement.scrollTop + links[0].refs.offsetTop;
    let currentTop = 0;
    links.forEach(link => {
        let bottom = link.refs.offsetTop + link.refs.offsetHeight - 20; // 20 px before
        if (scrollPos >= currentTop && scrollPos < bottom) {
            link.i.className = "material-icons";
            link.link.classList.add("current");
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

    // background choice
    const width = window.screen.width;
    const height = window.screen.height;
    let chosen = BACKGROUNDS[BACKGROUNDS.length - 1]; // in case no size fits, take biggest
    for (const bg of BACKGROUNDS) {
        if (bg.width >= width && bg.height >= height) {
            chosen = bg;
            break;
        }
    }
    document.body.style.backgroundImage = `url(${chosen.url})`;
});

window.addEventListener("scroll", updateMenuIcons);
window.addEventListener("resize", updateMenuIcons);
