import {Plugin, SettingsTypes} from "@highlite/plugin-api";

export default class TtsChat extends Plugin {
    pluginName: string = 'TTS Chat';
    author = '0rangeYouGlad';

    private isInitialized = false;
    private messageWatchersSetup = false;
    private processedMessages = new Set<HTMLElement>();
    
    private synth = window.speechSynthesis;
    private voices = this.synth.getVoices();

    constructor() {
        super();

        this.settings.sayPlayerNames = {
            text: 'Prefix Player Names',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {},
        };

        this.settings.randVoices = {
            text: 'Use Random Voices',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {},
        };

        this.settings.basePitch = {
            text: 'Base Pitch',
            type: SettingsTypes.text,
            value: '1.0',
            callback: () => {},
        };

        this.settings.pitchVariance = {
            text: 'Pitch Variance',
            type: SettingsTypes.text,
            value: '2.0',
            callback: () => {},
        };

        this.settings.baseRate = {
            text: 'Base Rate',
            type: SettingsTypes.text,
            value: '1.5',
            callback: () => {},
        };

        this.settings.interruptableVoices = {
            text: 'Interruptable Voices',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {},
        };

        this.settings.globalChat = {
            text: 'Global Chat',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {},
        };
        
        this.settings.sayGameMessages = {
            text: 'Status Messages',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {},
        };

        this.settings.localChat = {
            text: 'Local Chat',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {},
        };

        this.settings.privateChat = {
            text: 'Private Chat',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {},
        };

        this.settings.volume = {
            text: 'Volume',
            type: SettingsTypes.text,
            value: '1.0',
            callback: () => {},
        };

    }

    init(): void {
        this.log('Initialized TtsChat');
    }

    start(): void {
        this.log('Started TtsChat');
        if(this.settings.enable.value) {
            this.synth = window.speechSynthesis;
            this.voices = this.synth.getVoices();
            this.isInitialized = true;
            this.setupMessageWatching();
        }
    }

    stop(): void {
        this.log('Stopped TtsChat');
        this.cleanup();
        this.isInitialized = false;
    }

    private cleanup(): void {
        this.log('Cleaning up TtsChat...');

        if (this.messageCheckInterval) {
            window.clearInterval(this.messageCheckInterval);
            this.messageCheckInterval = null;
        }

        this.processedMessages.clear();

        this.isInitialized = false;
        this.messageWatchersSetup = false;
        this.log('TtsChat cleanup complete');
    }
    
    private setupMessageWatching(): void {
        if (this.messageWatchersSetup) return;
        this.messageWatchersSetup = true;

        this.scanAllMessages();

        const watchPairs = [
            ['#hs-public-message-list', '#hs-public-message-list__container'],
            ['#hs-private-message-list', '#hs-private-message-list'],
        ];

        watchPairs.forEach(([listSel, wrapSel]) => {
            const list = document.querySelector(listSel);
            const wrap = document.querySelector(wrapSel) as HTMLElement;
            if (list && wrap) {
                this.trackObserver(
                    records => {
                        records.forEach(record => {
                            if (record.addedNodes.length) {
                                setTimeout(() => this.scanAllMessages(), 10);
                            }
                            if (record.removedNodes.length) {
                                this.cleanupRemovedMessages(
                                    record.removedNodes
                                );
                            }
                        });
                    },
                    list,
                    { childList: true, subtree: true }
                );
            }
        });

        this.messageCheckInterval = window.setInterval(() => {
            this.scanAllMessages();
        }, 500);
    }

    private scanAllMessages(): void {
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const containers = [
            document.querySelector('#hs-public-message-list__container'),
            document.querySelector('#hs-private-message-list'),
        ];

        containers.forEach(container => {
            if (container) {
                this.processNewMessages(container as HTMLElement);
            }
        });
    }

    private getPitchForPlayerNameHash(playerName: string) {
        if(!playerName) {
            return 0.0;
        }
        return Number(this.settings.pitchVariance.value) * (Number(playerName.charCodeAt(0)) % 25) / 25.0;
    }

    private getVoiceForPlayerNameHash(playerName: string) {
        if(!playerName) {
            return this.voices[0];
        }
        return this.voices[playerName.length % this.voices.length];
    }

    private speak(textToSpeak: string, playerName: string) {
        const utterThis = new SpeechSynthesisUtterance(textToSpeak);
        utterThis.voice = this.voices[0];

        if(this.settings.randVoices.value) {
            utterThis.voice = this.getVoiceForPlayerNameHash(playerName);
        }

        utterThis.pitch = Number(this.settings.basePitch.value) + this.getPitchForPlayerNameHash(playerName);
        utterThis.rate = Number(this.settings.baseRate.value);

        utterThis.volume = Number(this.settings.volume.value);

        // this.log("Speaking with voice " + utterThis.voice.name + " at pitch " + utterThis.pitch + " and rate " + utterThis.rate);

        if(this.settings.interruptableVoices.value) {
            this.synth.cancel();
        }

        this.synth.speak(utterThis);
        utterThis.onpause = (event) => {
            const char = event.utterance.text.charAt(event.charIndex);
            this.log(
            `Speech paused at character ${event.charIndex} of "${event.utterance.text}", which is "${char}".`,
            );
        };
    }

    private processNewMessages(container: HTMLElement): void {
        if (!container) return;
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const messages = container.querySelectorAll(
            '.hs-chat-message-container'
        );

        messages.forEach(msg => {
            const msgEl = msg as HTMLElement;

            if (this.processedMessages.has(msgEl)) return;

            this.processedMessages.add(msgEl);

            let playerNameContainer = msgEl.querySelector(
                '.hs-chat-menu__player-name'
            );
            if(!playerNameContainer) {
                playerNameContainer = msgEl.querySelector('.hs-chat-menu__pre-text')
            }
            const playerName = `${playerNameContainer?.textContent}`.replace("From ", "").replace(":", "").trim();

            let textContent = msgEl.querySelector('.hs-chat-menu__message-text-container')?.textContent?.replaceAll('[-]', '');

            if (
                !msgEl.dataset.ttsInjected
            ) {
                msgEl.dataset.ttsInjected = 'true';

                if(!this.settings.globalChat.value && msgEl.querySelector('.hs-text--orange'))
                {
                    // this.log("TTS Ignoring Global chat");
                }
                else if(!this.settings.privateChat.value && msgEl.querySelector('.hs-text--cyan')) {
                    // this.log("TTS Ignoring Private chat");
                }
                else if(!this.settings.localChat.value && msgEl.querySelector('.hs-text--yellow')) {
                    // this.log("TTS Ignoring Local chat");
                }

                else if(playerName && playerNameContainer?.textContent) {
                    if(this.settings.sayPlayerNames.value) { 
                        this.speak(`${playerName} says ${textContent}`, playerName);
                    } else {
                        this.speak(`${textContent}`, playerName);
                    }
                } else if(this.settings.sayGameMessages.value) {
                    this.speak(`${textContent}`, playerName);
                }
            }
        });
    }
}
