document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const keyboardVisual = document.getElementById('keyboardVisual');
    const testArea = document.getElementById('testArea');
    const keysPressedElement = document.getElementById('keysPressed');
    const lastKeyElement = document.getElementById('lastKey');
    const lastKeyCodeElement = document.getElementById('lastKeyCode');
    const keyHistoryElement = document.getElementById('keyHistory');
    const kpmElement = document.getElementById('kpm');
    const soundToggle = document.getElementById('soundToggle');

    // State variables
    let keysPressed = 0;
    let keyPressHistory = [];
    let keyPressTimestamps = [];
    let soundEnabled = false;

    // Key configurations
    const keyRows = [
        ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
        ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
        ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
        ['CapsLock', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\'', 'Enter'],
        ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift'],
        ['Control', 'Meta', 'Alt', ' ', 'Alt', 'Meta', 'Control'],
        ['ArrowUp'],
        ['ArrowLeft', 'ArrowDown', 'ArrowRight']
    ];

    // Special keys that should have different styling
    const specialKeys = [
        'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'Tab', 'CapsLock', 'Shift', 'Control', 'Meta', 'Alt', 'Enter', 'Backspace', 'ArrowUp',
        'ArrowLeft', 'ArrowDown', 'ArrowRight'
    ];

    // Key display names mapping
    const keyDisplayNames = {
        '`': '~ `', '1': '! 1', '2': '@ 2', '3': '# 3', '4': '$ 4', '5': '% 5',
        '6': '^ 6', '7': '& 7', '8': '* 8', '9': '( 9', '0': ') 0', '-': '_ -',
        '=': '+ =', '[': '{ [', ']': '} ]', '\\': '| \\', ';': ': ;', '\'': '" \'',
        ',': '< ,', '.': '> .', '/': '? /', ' ': 'Space', 'ArrowUp': '↑',
        'ArrowLeft': '←', 'ArrowDown': '↓', 'ArrowRight': '→'
    };

    // Create the visual keyboard
    function createKeyboard() {
        keyRows.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.style.display = 'flex';
            rowDiv.style.gap = '0.5rem';
            rowDiv.style.marginBottom = '0.5rem';
            rowDiv.style.width = '100%';
            
            row.forEach(key => {
                const keyElement = document.createElement('div');
                const displayName = keyDisplayNames[key] || key;
                
                keyElement.textContent = displayName.split(' ')[0];
                keyElement.classList.add('key');
                
                if (specialKeys.includes(key)) {
                    keyElement.classList.add('special');
                }
                
                if (key === ' ') {
                    keyElement.classList.add('space');
                }
                
                if (key.startsWith('Arrow')) {
                    keyElement.classList.add('arrow');
                }
                
                // Add key code display
                const keyCodeElement = document.createElement('div');
                keyCodeElement.classList.add('key-code-display');
                keyCodeElement.textContent = getKeyCode(key);
                keyElement.appendChild(keyCodeElement);
                
                keyElement.dataset.key = key;
                rowDiv.appendChild(keyElement);
            });
            
            keyboardVisual.appendChild(rowDiv);
        });
    }

    // Helper function to get key code
    function getKeyCode(key) {
        // This is a simplified mapping - in a real app you'd want a more complete solution
        const keyCodeMap = {
            'Escape': 'Esc',
            'Backspace': 'Backspace',
            'Tab': 'Tab',
            'Enter': 'Enter',
            'Shift': 'Shift',
            'Control': 'Ctrl',
            'Meta': 'Meta',
            'Alt': 'Alt',
            'CapsLock': 'Caps',
            ' ': 'Space',
            'ArrowUp': '↑',
            'ArrowLeft': '←',
            'ArrowDown': '↓',
            'ArrowRight': '→'
        };
        
        return keyCodeMap[key] || key;
    }

    // Play key press sound
    function playKeySound() {
        if (!soundEnabled) return;
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 800 + Math.random() * 400;
        gainNode.gain.value = 0.1;
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    // Handle key press
    function handleKeyPress(event) {
        // Prevent default for all keys except when typing in the textarea
        if (event.target !== testArea) {
            event.preventDefault();
        }
        
        const key = event.key;
        const code = event.code;
        
        // Update keys pressed count
        keysPressed++;
        keysPressedElement.textContent = keysPressed;
        
        // Update last key pressed
        const displayKey = key === ' ' ? 'Space' : key;
        lastKeyElement.textContent = displayKey;
        lastKeyCodeElement.textContent = code;
        
        // Add to history
        keyPressHistory.unshift(displayKey);
        if (keyPressHistory.length > 20) {
            keyPressHistory.pop();
        }
        
        // Update key press timestamps for KPM calculation
        const now = Date.now();
        keyPressTimestamps.push(now);
        
        // Remove timestamps older than 10 seconds
        keyPressTimestamps = keyPressTimestamps.filter(timestamp => now - timestamp <= 10000);
        
        // Calculate KPM
        const kpm = Math.round((keyPressTimestamps.length / 10) * 60);
        kpmElement.textContent = kpm;
        
        // Update history display
        updateKeyHistory();
        
        // Highlight the pressed key on the visual keyboard
        highlightKey(key, code);
        
        // Play sound if enabled
        playKeySound();
    }

    // Update the key history display
    function updateKeyHistory() {
        keyHistoryElement.innerHTML = '';
        
        keyPressHistory.forEach(key => {
            const keyElement = document.createElement('span');
            keyElement.classList.add('history-key');
            keyElement.textContent = key;
            keyHistoryElement.appendChild(keyElement);
        });
    }

    // Highlight the pressed key on the visual keyboard
    function highlightKey(key, code) {
        // First, remove active class from all keys
        document.querySelectorAll('.key').forEach(el => {
            el.classList.remove('active');
        });
        
        // Find the key that matches either by key or code
        let keyElements;
        
        // Special handling for space
        if (key === ' ') {
            keyElements = document.querySelectorAll('.key[data-key=" "]');
        } else {
            // Try to match by code first (more accurate for physical key position)
            keyElements = document.querySelectorAll(`.key[data-key="${code}"]`);
            
            // If no match, try by key
            if (keyElements.length === 0) {
                keyElements = document.querySelectorAll(`.key[data-key="${key}"]`);
            }
            
            // For shifted keys, try without shift
            if (keyElements.length === 0 && key.length === 1) {
                const lowerKey = key.toLowerCase();
                if (lowerKey !== key) {
                    keyElements = document.querySelectorAll(`.key[data-key="${lowerKey}"]`);
                }
            }
        }
        
        // Add active class to all matching keys
        keyElements.forEach(el => {
            el.classList.add('active');
            
            // Remove active class after animation
            setTimeout(() => {
                el.classList.remove('active');
            }, 200);
        });
    }

    // Initialize the app
    function init() {
        createKeyboard();
        
        // Event listeners
        document.addEventListener('keydown', handleKeyPress);
        testArea.addEventListener('keydown', handleKeyPress);
        
        soundToggle.addEventListener('change', function() {
            soundEnabled = this.checked;
        });
        
        // Instructions for mobile users
        if (/Mobi|Android/i.test(navigator.userAgent)) {
            testArea.placeholder = "Tap here to open the virtual keyboard for testing...";
        }
    }

    init();
});