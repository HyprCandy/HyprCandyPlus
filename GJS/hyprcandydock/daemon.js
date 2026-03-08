// HyprCandy Dock Daemon - Modern Event-Driven Architecture
// Efficient socket monitoring with zero polling

const {Gio, GLib} = imports.gi;

var Daemon = class {
    constructor(dock) {
        this.dock = dock;
        this.clients = new Map(); // Map<className, client[]>
        this.activeAddress = '';
        this.pinnedApps = new Set();
        this.iconCache = new Map(); // Icon caching
        this.socketConnection = null;
        this.eventSource = null;
        this.hyprDir = '';
        this.his = '';
        
        this.setupHyprlandPaths();
        this.loadPinnedApps();
    }
    
    setupHyprlandPaths() {
        const xdgRuntime = GLib.getenv('XDG_RUNTIME_DIR') || '/tmp';
        const his = GLib.getenv('HYPRLAND_INSTANCE_SIGNATURE');
        
        if (his) {
            this.hyprDir = `${xdgRuntime}/hypr`;
            this.his = his;
        } else {
            this.hyprDir = '/tmp/hypr';
            const dir = Gio.File.new_for_path(this.hyprDir);
            if (dir.query_exists(null)) {
                const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
                let fileInfo;
                while ((fileInfo = enumerator.next_file(null)) !== null) {
                    const name = fileInfo.get_name();
                    if (name.includes('.socket.sock')) {
                        this.his = name.replace('.socket.sock', '');
                        break;
                    }
                }
            }
        }
        
        console.log(`🔌 Daemon paths: ${this.hyprDir}/${this.his}`);
    }
    
    // Efficient direct socket communication
    async hyprctl(cmd) {
        return new Promise((resolve, reject) => {
            const socketFile = `${this.hyprDir}/${this.his}/.socket.sock`;
            const socketAddress = Gio.UnixSocketAddress.new(socketFile);
            const socketClient = Gio.SocketClient.new();
            
            socketClient.connect_async(socketAddress, null, (source, result) => {
                try {
                    const connection = source.connect_finish(result);
                    if (!connection) {
                        reject(new Error('Failed to connect'));
                        return;
                    }
                    
                    const message = new GLib.Bytes(cmd);
                    const outputStream = connection.get_output_stream();
                    outputStream.write_bytes_async(message, 0, null, (source, result) => {
                        try {
                            source.write_bytes_finish(result);
                            
                            const inputStream = connection.get_input_stream();
                            const dataStream = Gio.DataInputStream.new(inputStream);
                            
                            dataStream.read_bytes_async(102400, 0, null, (source, result) => {
                                try {
                                    const bytes = source.read_bytes_finish(result);
                                    if (bytes) {
                                        const data = bytes.get_data();
                                        const response = new TextDecoder().decode(data);
                                        connection.close(null);
                                        resolve(response);
                                    } else {
                                        connection.close(null);
                                        resolve('');
                                    }
                                } catch (e) {
                                    connection.close(null);
                                    reject(e);
                                }
                            });
                        } catch (e) {
                            connection.close(null);
                            reject(e);
                        }
                    });
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
    
    // Load pinned apps efficiently
    loadPinnedApps() {
        const pinnedFile = `${GLib.getenv('HOME')}/.hyprcandy/GJS/hyprcandydock/pinned`;
        const file = Gio.File.new_for_path(pinnedFile);
        
        if (file.query_exists(null)) {
            const [, contents] = file.load_contents(null);
            const pinned = new TextDecoder().decode(contents);
            pinned.trim().split('\n').forEach(app => {
                if (app.trim()) this.pinnedApps.add(app.trim());
            });
        }
        
        console.log(`📌 Loaded ${this.pinnedApps.size} pinned apps`);
    }
    
    // Icon loading with caching
    getIcon(className) {
        if (this.iconCache.has(className)) {
            return this.iconCache.get(className);
        }
        
        // Try to find icon from desktop files
        const icon = this.findIcon(className);
        this.iconCache.set(className, icon);
        console.log(`🎨 Icon for ${className}: ${icon}`);
        return icon;
    }
    
    findIcon(className) {
        // Convert className to possible desktop file names
        const possibleNames = [
            className, // Exact match: "org.gnome.Nautilus"
            className.toLowerCase(),
            className.replace(/\s+/g, '-').toLowerCase(),
            className.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
            className.split('.').pop() // Last part: "Nautilus"
        ];
        
        const appDirs = [
            `${GLib.getenv('HOME')}/.local/share/applications`,
            '/usr/share/applications',
            '/usr/local/share/applications'
        ];
        
        console.log(`🔍 Looking for icon: ${className} -> ${possibleNames.join(', ')}`);
        
        for (const appDir of appDirs) {
            for (const desktopName of possibleNames) {
                const filePath = `${appDir}/${desktopName}.desktop`;
                const file = Gio.File.new_for_path(filePath);
                
                if (file.query_exists(null)) {
                    try {
                        const [, contents] = file.load_contents(null);
                        const content = new TextDecoder().decode(contents);
                        const match = content.match(/^Icon=(.+)$/m);
                        if (match) {
                            const icon = match[1].trim();
                            console.log(`✅ Found icon: ${icon} in ${filePath}`);
                            return icon;
                        }
                    } catch (e) {
                        console.warn(`⚠️ Error reading ${filePath}:`, e);
                    }
                }
            }
        }
        
        console.log(`❌ No icon found for ${className}, using fallback`);
        return 'application-x-executable'; // Fallback icon
    }
    
    // Get initial client list
    async loadInitialClients() {
        try {
            const response = await this.hyprctl('j/clients');
            if (response) {
                const clients = JSON.parse(response);
                this.updateClientMap(clients);
                
                // Get active window
                const activeResponse = await this.hyprctl('j/activewindow');
                if (activeResponse) {
                    const active = JSON.parse(activeResponse);
                    this.activeAddress = active.address || '';
                }
                
                console.log(`📊 Loaded ${clients.length} clients`);
                return clients;
            }
        } catch (e) {
            console.error('❌ Error loading initial clients:', e);
        }
        return [];
    }
    
    // Update client map efficiently
    updateClientMap(clients) {
        this.clients.clear();
        
        clients.forEach(client => {
            if (!client.class) return;
            
            if (!this.clients.has(client.class)) {
                this.clients.set(client.class, []);
            }
            this.clients.get(client.class).push(client);
        });
        
        // Update dock
        this.dock.updateFromDaemon(this.getClientData());
    }
    
    // Get client data for dock
    getClientData() {
        const data = [];
        
        // Add pinned apps first
        this.pinnedApps.forEach(className => {
            const instances = this.clients.get(className) || [];
            data.push({
                className,
                instances,
                pinned: true,
                running: instances.length > 0,
                active: instances.some(c => c.address === this.activeAddress)
            });
        });
        
        // Add running apps that aren't pinned
        this.clients.forEach((instances, className) => {
            if (!this.pinnedApps.has(className)) {
                data.push({
                    className,
                    instances,
                    pinned: false,
                    running: true,
                    active: instances.some(c => c.address === this.activeAddress)
                });
            }
        });
        
        return data;
    }
    
    // Start event monitoring - NO POLLING
    startEventMonitoring() {
        const socketFile = `${this.hyprDir}/${this.his}/.socket2.sock`;
        const socketAddress = Gio.UnixSocketAddress.new(socketFile);
        const socketClient = Gio.SocketClient.new();
        
        socketClient.connect_async(socketAddress, null, (source, result) => {
            try {
                const connection = source.connect_finish(result);
                if (!connection) {
                    console.error('❌ Failed to connect to event socket');
                    return;
                }
                
                console.log('🪟 Started efficient event monitoring');
                this.socketConnection = connection;
                this.monitorEvents();
                
            } catch (e) {
                console.error('❌ Event socket error:', e);
            }
        });
    }
    
    // Monitor events efficiently
    monitorEvents() {
        const inputStream = this.socketConnection.get_input_stream();
        const dataStream = Gio.DataInputStream.new(inputStream);
        
        const readEvent = () => {
            dataStream.read_line_async(0, null, (source, result) => {
                try {
                    const [line] = source.read_line_finish(result);
                    if (line) {
                        const event = new TextDecoder().decode(line);
                        this.processEvent(event);
                        readEvent(); // Continue reading
                    }
                } catch (e) {
                    console.error('❌ Event read error:', e);
                    // Reconnect after error
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        this.startEventMonitoring();
                        return false;
                    });
                }
            });
        };
        
        readEvent();
    }
    
    // Process events efficiently
    async processEvent(event) {
        if (event.includes('activewindowv2')) {
            const match = event.match(/activewindowv2>>(0x[a-f0-9]+)/);
            if (match) {
                const newAddress = match[1];
                if (newAddress !== this.activeAddress) {
                    this.activeAddress = newAddress;
                    await this.refreshClients();
                }
            }
        } else if (event.includes('openwindow') || event.includes('closewindow')) {
            await this.refreshClients();
        }
    }
    
    // Refresh clients when needed
    async refreshClients() {
        try {
            const response = await this.hyprctl('j/clients');
            if (response) {
                const clients = JSON.parse(response);
                this.updateClientMap(clients);
            }
        } catch (e) {
            console.error('❌ Error refreshing clients:', e);
        }
    }
    
    // Focus window
    focusWindow(address) {
        this.hyprctl(`dispatch focuswindow address:${address}`).then(() => {
            console.log(`🎯 Focused: ${address}`);
        }).catch(e => {
            console.error('❌ Error focusing window:', e);
        });
    }
    
    // Close window
    closeWindow(address) {
        this.hyprctl(`dispatch closewindow address:${address}`).then(() => {
            console.log(`❌ Closed: ${address}`);
        }).catch(e => {
            console.error('❌ Error closing window:', e);
        });
    }
    
    // Toggle pin
    togglePin(className) {
        if (this.pinnedApps.has(className)) {
            this.pinnedApps.delete(className);
        } else {
            this.pinnedApps.add(className);
        }
        this.savePinnedApps();
        this.refreshClients();
    }
    
    // Save pinned apps
    savePinnedApps() {
        const pinnedFile = `${GLib.getenv('HOME')}/.hyprcandy/GJS/hyprcandydock/pinned`;
        const file = Gio.File.new_for_path(pinnedFile);

        const content = Array.from(this.pinnedApps).join('\n') + '\n';
        file.replace_contents(null, content, -1, true, Gio.FileCreateFlags.NONE, null);

        console.log(`💾 Saved ${this.pinnedApps.size} pinned apps`);
    }

    // Get available GPUs from the system
    getAvailableGPUs() {
        const gpus = [];
        
        // Check for NVIDIA GPUs
        try {
            const nvidiaSmi = GLib.find_program_in_path('nvidia-smi');
            if (nvidiaSmi) {
                const [, stdout] = GLib.spawn_command_line_sync('nvidia-smi --query-gpu=name --format=csv,noheader');
                const gpuNames = new TextDecoder().decode(stdout).trim().split('\n');
                gpuNames.forEach(name => {
                    if (name.trim()) gpus.push(name.trim());
                });
            }
        } catch (e) {
            console.warn('⚠️ Could not detect NVIDIA GPUs:', e);
        }

        // Check for AMD GPUs
        try {
            const [, stdout] = GLib.spawn_command_line_sync('lspci -k | grep -EA3 \'VGA|3D\'');
            const output = new TextDecoder().decode(stdout);
            if (output.toLowerCase().includes('amd') || output.toLowerCase().includes('radeon')) {
                const matches = output.match(/AMD.*?(?=Kernel|$)/g);
                if (matches) {
                    matches.forEach(match => {
                        const gpuName = match.trim().replace(/\s+/g, ' ');
                        if (gpuName && !gpus.includes(gpuName)) gpus.push(gpuName);
                    });
                }
            }
        } catch (e) {
            console.warn('⚠️ Could not detect AMD GPUs:', e);
        }

        // Check for Intel GPUs
        try {
            const [, stdout] = GLib.spawn_command_line_sync('lspci -k | grep -EA3 \'VGA|3D\'');
            const output = new TextDecoder().decode(stdout);
            if (output.toLowerCase().includes('intel')) {
                const matches = output.match(/Intel.*?(?=Kernel|$)/g);
                if (matches) {
                    matches.forEach(match => {
                        const gpuName = match.trim().replace(/\s+/g, ' ');
                        if (gpuName && !gpus.includes(gpuName)) gpus.push(gpuName);
                    });
                }
            }
        } catch (e) {
            console.warn('⚠️ Could not detect Intel GPUs:', e);
        }

        // Fallback: use generic names if no GPUs detected
        if (gpus.length === 0) {
            gpus.push('Integrated GPU');
            gpus.push('Discrete GPU');
        }

        console.log(`🎮 Available GPUs: ${gpus.join(', ')}`);
        return gpus;
    }

    // Launch application with specific GPU
    launchWithGPU(className, gpu) {
        // Get the exec command from desktop file
        const execCmd = this.getExecFromDesktop(className);
        
        if (execCmd) {
            let launchCmd = '';
            
            // Determine GPU and set appropriate environment variables
            if (gpu.toLowerCase().includes('nvidia')) {
                launchCmd = `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia ${execCmd}`;
            } else if (gpu.toLowerCase().includes('amd') || gpu.toLowerCase().includes('radeon')) {
                launchCmd = `DRI_PRIME=1 ${execCmd}`;
            } else if (gpu.toLowerCase().includes('intel')) {
                launchCmd = `DRI_PRIME=0 ${execCmd}`;
            } else {
                launchCmd = execCmd;
            }
            
            console.log(`🚀 Launching with GPU ${gpu}: ${launchCmd}`);
            GLib.spawn_command_line_async(launchCmd);
        } else {
            // Fallback to simple launch
            GLib.spawn_command_line_async(className.toLowerCase());
        }
    }

    // Get executable command from desktop file
    getExecFromDesktop(className) {
        const appDirs = [
            `${GLib.getenv('HOME')}/.local/share/applications`,
            '/usr/share/applications',
            '/usr/local/share/applications'
        ];

        const possibleNames = [
            className,
            className.toLowerCase(),
            className.replace(/\s+/g, '-').toLowerCase(),
            className.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
            className.split('.').pop()
        ];

        for (const appDir of appDirs) {
            for (const desktopName of possibleNames) {
                const filePath = `${appDir}/${desktopName}.desktop`;
                const file = Gio.File.new_for_path(filePath);

                if (file.query_exists(null)) {
                    try {
                        const [, contents] = file.load_contents(null);
                        const content = new TextDecoder().decode(contents);
                        const execMatch = content.match(/^Exec=(.+)$/m);
                        if (execMatch) {
                            let execCmd = execMatch[1].trim();
                            // Remove field codes like %U, %F, etc.
                            execCmd = execCmd.replace(/%[UuFfIiDdNnVvKk]/g, '').trim();
                            console.log(`✅ Found exec: ${execCmd} in ${filePath}`);
                            return execCmd;
                        }
                    } catch (e) {
                        console.warn(`⚠️ Error reading ${filePath}:`, e);
                    }
                }
            }
        }

        return null;
    }

    // Clean shutdown
    shutdown() {
        if (this.socketConnection) {
            this.socketConnection.close(null);
        }
        if (this.eventSource) {
            GLib.source_remove(this.eventSource);
        }
        console.log('🔌 Daemon shutdown complete');
    }
};
