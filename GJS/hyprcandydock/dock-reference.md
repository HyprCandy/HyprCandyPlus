Perfect. A few things:
1. Can I export this  export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}" as an env variable in hyprviz.conf or during auto-start?
2. Cand the dock use my gtk-4.0 matugen colors with @blur_background and the border @as on_primary_fixed_variant by default since it'll only be on my HyprCandy setup which by default uses matugen colors everywhere?
3. Instead of the lightnign emoticon on the start button use this Linux glyph "" as in future we'll add an input bot on start-button right-click to easily paste a new glyph? (The glyph should have the @primary color which aut-scales based on icon size and all dock variable should hot update when edited by the user without needing to manually relaunch the app probably through a custom SIGURS signal where by when a change is made and saved the signal is sent to the dock for a hot refresh, this way it won't need to watch for variable changes - to be implemented when we work on candy-utils refactor to use the HyprCandy dock instead of nwg-dock-hyprland)
4. As show in the screenshot, the size you've started with is too large compared to nwg. Similar to nwg-dock-hyprland, let our custom dock have a user style.css config at ~/.hyprcandy/GJS/hyprcandydock where I've already copied the relevant files nwg's style.css as well as already adding a matugen colors template pointing to the folder
4. On the apps section I see you some default apps. I hope you'll add features like drag and drop, new running app detection, popover menus with options to (pin/unpin, instances tracking and closing individual instances, move to to workspace [1-10], launch with discrete graphics option{dgpu option will work since we already add sudoers entry for gpu checks for the system monitor- the dock popover just lists available gpus to launch with} and the popover can have side menus for some of the options like the discrete graphics  incase multiple are found as well as the move to workspc for each instance using hyprctl).
5. We need detection+indication of active windows so use this glyph also with primary color 󰧟 at a small size and limit to showing two of them when two or more instances of the app are running.
6. Like GNOME, a tresh icon after the last seperator usig this glyph  󰩺 also with @ primary.

So basically for theming:
color: @primary;
border: 2px solid @on_primary_fixed_variant;
background-color: @blur_background;

Plus all other requested features