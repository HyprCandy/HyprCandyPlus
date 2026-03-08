#!/usr/bin/env gjs

// HyprCandy Dock - GNOME Dash-style Implementation
// Based on GNOME 49 dash/dock architecture with HyprCandy theming

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gdk = '4.0';

const {Gtk, Gdk, Gio, GLib, GObject} = imports.gi;
const Gtk4LayerShell = imports.gi.Gtk4LayerShell;

// Import modern daemon
imports.searchPath.unshift('.');
const Daemon = imports.daemon.Daemon;

// Icon size constant - easily adjustable
const ICON_SIZE = 22;
const INDICATOR_FONT_SIZE = 4;
const BUTTON_PADDING = 4;
const DOCK_MIN_WIDTH = 100;

const Dock = GObject.registerClass({
    GTypeName: 'HyprCandyDock',
}, class Dock extends Gtk.ApplicationWindow {
    _init() {
        super._init({
            title: 'HyprCandy Dock',
            decorated: false,
        });

        // Modern daemon-based architecture
        this.daemon = new Daemon(this);
        this.clientWidgets = new Map(); // Cache widgets

        // Setup window and layer shell
        this.setupLayerShell();
        this.createDock();

        // Load initial data and start monitoring
        this.initializeDock();
    }

    setupLayerShell() {
        // Modern GTK4 Layer Shell setup
        Gtk4LayerShell.init_for_window(this);
        Gtk4LayerShell.set_namespace(this, 'hyprcandy-dock');

        // Configure for bottom dock - only anchor bottom, not sides
        Gtk4LayerShell.set_layer(this, Gtk4LayerShell.Layer.OVERLAY);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.BOTTOM, true);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.LEFT, false);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.RIGHT, false);
        Gtk4LayerShell.set_anchor(this, Gtk4LayerShell.Edge.TOP, false);

        // Set exclusive zone to 40 (reserved space for dock - slightly larger than dock height)
        Gtk4LayerShell.set_exclusive_zone(this, 40);

        // Margins: 6px from screen edge bottom, 10px left/right for gap
        Gtk4LayerShell.set_margin(this, Gtk4LayerShell.Edge.BOTTOM, 6);
        Gtk4LayerShell.set_margin(this, Gtk4LayerShell.Edge.LEFT, 10);
        Gtk4LayerShell.set_margin(this, Gtk4LayerShell.Edge.RIGHT, 10);

        console.log('🪟 Layer shell configured for hyprcandy-dock');
    }

    createDock() {
        // Create horizontal box for all elements
        this.mainBox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 0);
        this.mainBox.set_name('box');
        this.mainBox.set_halign(Gtk.Align.CENTER);
        
        this.set_child(this.mainBox);
        
        // Set minimum width for dock to shrink properly
        this.set_default_size(DOCK_MIN_WIDTH, -1);

        // Apply modern CSS
        this.applyCSS();

        console.log('🎨 Unified layer dock with per-app indicators created');
    }

    applyCSS() {
        const cssProvider = new Gtk.CssProvider();

        // Modern CSS with matugen variables - Precise GTK override targeting
        const css = `
            window.background {
                background-color: @blur_background;
                border-radius: 30px;
                border-style: solid;
                border-width: 2px;
                border-color: @on_primary_fixed_variant;
            }

            #box {
                padding: 0px;
                background: transparent;
            }

            #active-indicator {
                color: @primary;
                font-size: ${INDICATOR_FONT_SIZE}px;
                padding: 0px;
                margin: 0px;
                min-width: 3px;
            }

            #start-icon {
                color: @primary;
                font-size: ${ICON_SIZE}px;
            }

            #trash-icon {
                color: @primary;
                font-size: ${ICON_SIZE}px;
            }

            /* Precise button targeting like swync example */
            #box > box > button {
                background: transparent;
                border: none;
                box-shadow: none;
                padding: 2px;
                margin: 0px 1px;
                min-width: ${ICON_SIZE + 4}px;
                min-height: ${ICON_SIZE + 4}px;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            #box > box > button:hover {
                background: transparent;
                border: none;
                box-shadow: none;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            #box > box > button:focus {
                background: transparent;
                border: none;
                box-shadow: none;
                outline: none;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            #box > box > button:active {
                background: transparent;
                border: none;
                box-shadow: none;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            #box > box > button image {
                background: transparent;
                border: none;
                box-shadow: none;
                -gtk-icon-style: regular;
                padding: 2px;
                border-radius: 50%;
                -gtk-icon-effect: none;
            }

            /* Fallback broader targeting */
            .app-icon {
                background: transparent;
                border: none;
                box-shadow: none;
                padding: 2px;
                margin: 0px 1px;
                min-width: ${ICON_SIZE + 4}px;
                min-height: ${ICON_SIZE + 4}px;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            .app-icon:hover,
            .app-icon:focus,
            .app-icon:active {
                background: transparent;
                border: none;
                box-shadow: none;
                -gtk-icon-effect: none;
                background-image: none;
                background-color: transparent;
            }

            /* Popover override mechanism */
            popover {
                background: transparent;
                border: none;
                box-shadow: none;
                -gtk-icon-effect: none;
            }

            popover > contents {
                background: @blur_background;
                border: 1px solid @on_primary_fixed_variant;
                border-radius: 12px;
                box-shadow: 0 4px 12px alpha(@black, 0.3);
            }

            separator {
                background-color: @on_primary_fixed_variant;
                opacity: 0.3;
                min-width: 1px;
                margin: 0px 8px;
            }

            /* Tooltip positioning above dock */
            tooltip {
                margin-top: -8px;
            }
        `;

        cssProvider.load_from_data(css, -1);

        const styleContext = this.get_style_context();
        styleContext.add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        console.log('🎨 HyprCandy CSS theme applied');
    }

    async initializeDock() {
        // Add start button at beginning
        this.addStartButton();
        
        // Add separator after start button
        this.addStartSeparator();
        
        // Load initial clients (apps go between separators)
        await this.daemon.loadInitialClients();
        
        // Start efficient event monitoring
        this.daemon.startEventMonitoring();
        
        // Add separator before trash button
        this.addEndSeparator();
        
        // Add trash button at end
        this.addTrashButton();
        
        // Show dock
        this.show();
        
        console.log('🚀 HyprCandy dock initialized');
    }

    // Update dock from daemon data - INCREMENTAL UPDATES
    updateFromDaemon(clientData) {
        const currentClasses = new Set(this.clientWidgets.keys());
        const newClasses = new Set(clientData.map(d => d.className));
        
        // Remove widgets for apps that no longer exist
        for (const className of currentClasses) {
            if (!newClasses.has(className)) {
                const widget = this.clientWidgets.get(className);
                if (widget) {
                    this.mainBox.remove(widget);
                    this.clientWidgets.delete(className);
                    console.log(`➖ Removed ${className} from dock`);
                }
            }
        }
        
        // Add or update widgets for current apps
        clientData.forEach(data => {
            if (!this.clientWidgets.has(data.className)) {
                // Add new widget
                this.addClientButton(data);
                console.log(`➕ Added ${data.className} to dock`);
            } else {
                // Update existing widget
                this.updateClientButton(data);
            }
        });
        
        console.log(`🔄 Incremental dock update: ${clientData.length} apps`);
    }
    
    // Update existing button without recreating
    updateClientButton(data) {
        const container = this.clientWidgets.get(data.className);
        if (!container) return;

        // Get the button from the container (first child)
        const button = container.get_first_child();
        
        // Update styling
        const styleContext = button.get_style_context();
        styleContext.remove_class('active');
        styleContext.remove_class('pinned');

        if (data.active) {
            styleContext.add_class('active');
        }
        if (data.pinned) {
            styleContext.add_class('pinned');
        }

        // Update tooltip
        const tooltip = `${data.className}${data.instances.length > 1 ? ` (${data.instances.length})` : ''}`;
        button.set_tooltip_text(tooltip);
        
        // Update indicator
        this.updateButtonIndicator(container, data);
    }
    
    // Update indicator for a specific app container
    updateButtonIndicator(container, data) {
        // Get the indicator from the container (second child)
        let child = container.get_first_child(); // button
        const indicator = child ? child.get_next_sibling() : null; // indicator
        
        if (indicator) {
            const instanceCount = data.instances ? data.instances.length : 0;
            if (instanceCount > 0) {
                indicator.set_text(''.repeat(Math.min(instanceCount, 2)));
            } else {
                indicator.set_text('');
            }
        }
    }

    addStartButton() {
        const startButton = Gtk.Button.new();
        startButton.add_css_class('app-icon');
        
        const startLabel = Gtk.Label.new(''); // Linux glyph
        startLabel.set_name('start-icon');
        startButton.set_child(startLabel);
        startButton.set_tooltip_text('Start Menu');
        startButton.connect('clicked', () => {
            GLib.spawn_command_line_async('rofi -show drun');
        });
        
        // Right-click menu for start button
        const gesture = new Gtk.GestureClick();
        gesture.set_button(3);
        gesture.connect('pressed', () => {
            this.showStartMenu(startButton);
        });
        startButton.add_controller(gesture);
        
        this.mainBox.append(startButton);
    }

    showStartMenu(button) {
        const menu = new Gtk.PopoverMenu();
        
        const actions = [
            { label: 'Applications', action: 'rofi -show drun' },
            { label: 'Files', action: 'nautilus' },
            { label: 'Terminal', action: 'kitty' },
            { label: 'Settings', action: 'gnome-control-center' },
        ];
        
        const vbox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        
        actions.forEach(item => {
            const btn = Gtk.Button.new_with_label(item.label);
            btn.connect('clicked', () => {
                GLib.spawn_command_line_async(item.action);
                menu.popdown();
            });
            vbox.append(btn);
        });
        
        menu.set_child(vbox);
        menu.set_parent(button);
        menu.popup();
    }

    addStartSeparator() {
        const separator = Gtk.Separator.new(Gtk.Orientation.VERTICAL);
        this.mainBox.append(separator);
    }
    
    addEndSeparator() {
        const separator = Gtk.Separator.new(Gtk.Orientation.VERTICAL);
        this.mainBox.append(separator);
    }

    addTrashButton() {
        // Trash button at far right (no separator here - handled by addEndSeparator)
        const trashButton = Gtk.Button.new();
        trashButton.add_css_class('app-icon');
        
        const trashLabel = Gtk.Label.new('󰩺'); // Trash glyph
        trashLabel.set_name('trash-icon');
        trashButton.set_child(trashLabel);
        trashButton.set_tooltip_text('Trash');
        trashButton.connect('clicked', () => {
            GLib.spawn_command_line_async('nautilus trash:///');
        });
        
        this.mainBox.append(trashButton);
    }

    addClientButton(data) {
        // Create vertical container for this app (icon + indicator)
        const appContainer = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        appContainer.set_halign(Gtk.Align.CENTER);
        appContainer.set_valign(Gtk.Align.END);
        
        const button = Gtk.Button.new();
        button.add_css_class('app-icon');
        button.set_name(`client-${data.className}`);

        // Set icon with fixed pixel size
        const icon = Gtk.Image.new_from_icon_name(this.daemon.getIcon(data.className));
        icon.set_pixel_size(ICON_SIZE);
        icon.set_halign(Gtk.Align.CENTER);
        button.set_child(icon);

        // Style based on state
        const styleContext = button.get_style_context();
        if (data.active) {
            styleContext.add_class('active');
        }
        if (data.pinned) {
            styleContext.add_class('pinned');
        }

        // Tooltip
        const tooltip = `${data.className}${data.instances.length > 1 ? ` (${data.instances.length})` : ''}`;
        button.set_tooltip_text(tooltip);

        // Click handlers - left click focuses window
        button.connect('clicked', () => {
            if (data.instances.length > 0) {
                this.daemon.focusWindow(data.instances[0].address);
            }
        });

        // Right-click menu
        const gesture = new Gtk.GestureClick();
        gesture.set_button(3);
        gesture.connect('pressed', () => {
            this.showContextMenu(data, button);
        });
        button.add_controller(gesture);

        // Add indicator directly below the button
        const indicator = Gtk.Label.new('');
        indicator.set_name(`indicator-${data.className}`);
        indicator.add_css_class('active-indicator');
        indicator.set_halign(Gtk.Align.CENTER);
        
        // Set indicator text based on instance count
        const instanceCount = data.instances ? data.instances.length : 0;
        if (instanceCount > 0) {
            indicator.set_text(''.repeat(Math.min(instanceCount, 2)));
        }
        
        // Assemble the container
        appContainer.append(button);
        appContainer.append(indicator);
        
        this.mainBox.append(appContainer);
        this.clientWidgets.set(data.className, appContainer);
    }

    showContextMenu(data, button) {
        // Create GTK4-style popover context menu with extensive options
        const popover = new Gtk.PopoverMenu();
        popover.set_parent(button);
        popover.set_has_arrow(false);
        
        // Create vertical box for menu items
        const menuBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
        menuBox.set_margin_start(6);
        menuBox.set_margin_end(6);
        menuBox.set_margin_top(6);
        menuBox.set_margin_bottom(6);

        // Add instances with their titles
        data.instances.forEach((instance, idx) => {
            const hbox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 6);
            hbox.set_margin_bottom(4);

            const icon = Gtk.Image.new_from_icon_name(this.daemon.getIcon(data.className));
            icon.set_pixel_size(16);
            hbox.append(icon);

            const title = instance.title.length > 25 ?
                instance.title.substring(0, 25) + "..." : instance.title;
            const label = Gtk.Label.new(`${title} (${instance.workspace.name || '?'})`);
            label.set_halign(Gtk.Align.START);
            hbox.append(label);

            // Create button for this instance
            const btn = Gtk.Button.new();
            btn.set_child(hbox);
            btn.add_css_class('menu-item');
            btn.connect('clicked', () => {
                this.daemon.focusWindow(instance.address);
                popover.popdown();
            });

            // Create submenu box (hidden by default)
            const submenuBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
            submenuBox.set_margin_start(16);
            submenuBox.visible = false;

            // Window actions
            const actions = [
                { label: 'Close Window', action: () => this.daemon.closeWindow(instance.address) },
                { label: 'Toggle Floating', action: () => this.daemon.hyprctl(`dispatch togglefloating address:${instance.address}`) },
                { label: 'Fullscreen', action: () => this.daemon.hyprctl(`dispatch fullscreen address:${instance.address}`) },
            ];

            actions.forEach(item => {
                const actionBtn = Gtk.Button.new_with_label(item.label);
                actionBtn.add_css_class('menu-action');
                actionBtn.set_halign(Gtk.Align.FILL);
                actionBtn.connect('clicked', () => {
                    item.action();
                    popover.popdown();
                });
                submenuBox.append(actionBtn);
            });

            // Move to workspace submenu
            const wsLabel = Gtk.Label.new('Move to Workspace');
            wsLabel.set_halign(Gtk.Align.START);
            wsLabel.add_css_class('menu-submenu-label');
            submenuBox.append(wsLabel);

            const wsBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
            for (let i = 1; i <= 10; i++) {
                const wsBtn = Gtk.Button.new_with_label(`Workspace ${i}`);
                wsBtn.add_css_class('menu-action');
                wsBtn.set_halign(Gtk.Align.FILL);
                wsBtn.connect('clicked', () => {
                    this.daemon.hyprctl(`dispatch movetoworkspace ${i},address:${instance.address}`);
                    popover.popdown();
                });
                wsBox.append(wsBtn);
            }
            submenuBox.append(wsBox);

            // GPU submenu
            const gpus = this.daemon.getAvailableGPUs();
            if (gpus.length > 0) {
                const gpuLabel = Gtk.Label.new('Launch with GPU');
                gpuLabel.set_halign(Gtk.Align.START);
                gpuLabel.add_css_class('menu-submenu-label');
                submenuBox.append(gpuLabel);

                const gpuBox = Gtk.Box.new(Gtk.Orientation.VERTICAL, 0);
                gpus.forEach(gpu => {
                    const gpuBtn = Gtk.Button.new_with_label(gpu);
                    gpuBtn.add_css_class('menu-action');
                    gpuBtn.set_halign(Gtk.Align.FILL);
                    gpuBtn.connect('clicked', () => {
                        this.daemon.launchWithGPU(data.className, gpu);
                        popover.popdown();
                    });
                    gpuBox.append(gpuBtn);
                });
                submenuBox.append(gpuBox);
            }

            // Toggle submenu button
            const toggleBtn = Gtk.Button.new_with_label('▼');
            toggleBtn.add_css_class('menu-toggle');
            toggleBtn.set_halign(Gtk.Align.END);
            toggleBtn.connect('clicked', () => {
                submenuBox.visible = !submenuBox.visible;
            });

            const instanceBox = Gtk.Box.new(Gtk.Orientation.HORIZONTAL, 4);
            instanceBox.append(btn);
            instanceBox.append(toggleBtn);
            menuBox.append(instanceBox);
            menuBox.append(submenuBox);

            if (idx < data.instances.length - 1) {
                const sep = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
                sep.set_margin_top(4);
                sep.set_margin_bottom(4);
                menuBox.append(sep);
            }
        });

        // Separator
        const sep1 = Gtk.Separator.new(Gtk.Orientation.HORIZONTAL);
        sep1.set_margin_top(6);
        sep1.set_margin_bottom(6);
        menuBox.append(sep1);

        // New window
        const newWinBtn = Gtk.Button.new_with_label('New Window');
        newWinBtn.add_css_class('menu-item');
        newWinBtn.set_halign(Gtk.Align.FILL);
        newWinBtn.connect('clicked', () => {
            GLib.spawn_command_line_async(data.className.toLowerCase());
            popover.popdown();
        });
        menuBox.append(newWinBtn);

        // Close all windows
        if (data.instances.length > 1) {
            const closeAllBtn = Gtk.Button.new_with_label('Close All Windows');
            closeAllBtn.add_css_class('menu-item');
            closeAllBtn.set_halign(Gtk.Align.FILL);
            closeAllBtn.connect('clicked', () => {
                data.instances.forEach(instance => {
                    this.daemon.closeWindow(instance.address);
                });
                popover.popdown();
            });
            menuBox.append(closeAllBtn);
        }

        // Pin/Unpin
        const pinBtn = Gtk.Button.new_with_label(data.pinned ? 'Unpin' : 'Pin');
        pinBtn.add_css_class('menu-item');
        pinBtn.set_halign(Gtk.Align.FILL);
        pinBtn.connect('clicked', () => {
            this.daemon.togglePin(data.className);
            popover.popdown();
        });
        menuBox.append(pinBtn);

        popover.set_child(menuBox);
        popover.popup();
    }

    vfunc_close_request() {
        this.daemon.shutdown();
        return false;
    }
});

// Application
const Application = GObject.registerClass({
    GTypeName: 'HyprCandyDockApplication',
}, class Application extends Gtk.Application {
    vfunc_activate() {
        const dock = new Dock();
        this.add_window(dock);
    }
});

// Launch
const app = new Application();
app.run(ARGV);
