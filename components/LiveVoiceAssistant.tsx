
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Loader2, X, MessageCircle } from 'lucide-react';
import useResponsiveMode from '../hooks/useResponsiveMode';

const LiveVoiceAssistant: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [isActive, setIsActive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [modelTranscript, setModelTranscript] = useState('');
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sessionRef = useRef<any>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const { isTablet, isStandalone } = useResponsiveMode();

    const decodeBase64 = (base64: string) => {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    };

    const decodeAudioData = async (data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> => {
        const dataInt16 = new Int16Array(data.buffer);
        const frameCount = dataInt16.length;
        const buffer = ctx.createBuffer(1, frameCount, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i] / 32768.0;
        }
        return buffer;
    };

    const startSession = async () => {
        if (!process.env.API_KEY) return;
        setIsConnecting(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setIsConnecting(false);
                        const inputCtx = new AudioContext({ sampleRate: 16000 });
                        const source = inputCtx.createMediaStreamSource(streamRef.current!);
                        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                        
                        processor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
                            
                            const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
                            sessionPromise.then(s => s.sendRealtimeInput({
                                media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                            }));
                        };
                        source.connect(processor);
                        processor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        if (msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                            const audioBytes = decodeBase64(msg.serverContent.modelTurn.parts[0].inlineData.data);
                            const buffer = await decodeAudioData(audioBytes, audioContextRef.current!);
                            const source = audioContextRef.current!.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioContextRef.current!.destination);
                            
                            const now = audioContextRef.current!.currentTime;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += buffer.duration;
                            sourcesRef.current.add(source);
                        }
                        
                        if (msg.serverContent?.outputTranscription) {
                            setModelTranscript(prev => prev + msg.serverContent!.outputTranscription!.text);
                        }
                        if (msg.serverContent?.inputTranscription) {
                            setTranscript(prev => prev + msg.serverContent!.inputTranscription!.text);
                        }
                        if (msg.serverContent?.turnComplete) {
                            setTranscript('');
                            setModelTranscript('');
                        }
                        if (msg.serverContent?.interrupted) {
                            sourcesRef.current.forEach(s => s.stop());
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onclose: () => setIsActive(false),
                    onerror: (e) => console.error(e)
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: 'You are a professional Arabic-speaking ERP assistant for Al-Mohaseb Al-Zaki. Help with accounting questions naturally via voice.',
                    outputAudioTranscription: {},
                    inputAudioTranscription: {}
                }
            });
            sessionRef.current = await sessionPromise;
        } catch (e) {
            console.error(e);
            setIsConnecting(false);
        }
    };

    const stopSession = () => {
        if (sessionRef.current) sessionRef.current.close();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        setIsActive(false);
    };

    useEffect(() => {
        return () => stopSession();
    }, []);

    return (
        <div className="fixed inset-0 z-[500] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 md:p-8 text-white font-tajawal">
            <button onClick={onClose} className="absolute top-4 md:top-8 left-4 md:left-8 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={22} /></button>
            
            <div className={`text-center ${isTablet ? 'mb-10' : 'mb-8'}`}>
                <div className={`${isTablet ? 'w-28 h-28' : 'w-24 h-24'} bg-gradient-to-br from-indigo-500 to-purple-700 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl animate-pulse ring-8 ring-indigo-500/10`}>
                    <Sparkles className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-2xl font-black mb-2">Gemini Live Advisor</h2>
                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">مساعدك المالي الصوتي المباشر</p>
            </div>

            <div className={`w-full ${isTablet ? 'max-w-2xl h-48' : 'max-w-md h-40'} bg-white/5 rounded-[2.5rem] border border-white/10 p-6 flex flex-col justify-center items-center ${isTablet ? 'mb-10' : 'mb-8'} relative overflow-hidden`}>
                <div className="absolute inset-0 opacity-10 flex items-center justify-center">
                    <MessageCircle size={150} />
                </div>
                <div className="relative z-10 text-center space-y-4">
                    {isActive ? (
                        <>
                            <div className="flex gap-1 items-center justify-center">
                                {[1,2,3,4,5].map(i => (
                                    <div key={i} className={`w-1 bg-indigo-400 rounded-full animate-bounce`} style={{ height: `${Math.random() * 30 + 10}px`, animationDelay: `${i * 0.1}s` }}></div>
                                ))}
                            </div>
                            <p className="text-sm font-bold text-white/90 dir-rtl line-clamp-2 px-4">
                                {modelTranscript || transcript || 'أنا أستمع إليك الآن...'}
                            </p>
                        </>
                    ) : (
                        <p className="text-gray-400 text-xs font-black uppercase tracking-widest">
                            {isConnecting ? 'جاري بدء الجلسة الصوتية...' : 'اضغط على الميكروفون للبدء'}
                        </p>
                    )}
                </div>
            </div>

            <button 
                onClick={isActive ? stopSession : startSession}
                disabled={isConnecting}
                className={`${isTablet ? 'w-28 h-28' : 'w-24 h-24'} rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${isActive ? 'bg-rose-600 shadow-rose-900/50' : 'bg-indigo-600 shadow-indigo-900/50 hover:bg-indigo-700'}`}
            >
                {isConnecting ? <Loader2 size={40} className="animate-spin" /> : (isActive ? <MicOff size={40} /> : <Mic size={40} />)}
            </button>

            <div className={`flex items-center gap-2 text-indigo-400/50 text-[10px] font-black uppercase tracking-widest ${isStandalone ? 'mt-10' : 'mt-8'}`}>
                <Volume2 size={14} />
                <span>Gemini 2.5 Native Audio Engine</span>
            </div>
        </div>
    );
};

export default LiveVoiceAssistant;
