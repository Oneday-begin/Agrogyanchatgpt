// Native details remains usable without JavaScript; enhance menu dismissal only.
const landingMenu = document.querySelector('.landing-mobile-menu');
if (landingMenu) {
    landingMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        landingMenu.open = false;
    }));
    document.addEventListener('click', event => {
        if (!landingMenu.contains(event.target)) landingMenu.open = false;
    });
    landingMenu.addEventListener('keydown', event => {
        if (event.key === 'Escape' && landingMenu.open) {
            landingMenu.open = false;
            landingMenu.querySelector('summary').focus();
        }
    });
}
