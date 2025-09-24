import sounddevice as sd
import numpy as np
from faster_whisper import WhisperModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import queue
import time

# ----------------- CONFIG -----------------
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION = 1.0  # seconds per chunk
SRC_LANG = "en"
TGT_LANG = "hi"        # Example: Hindi
PAUSE_THRESHOLD = 0.8  # seconds of silence = commit
# ------------------------------------------

# Queue to hold audio chunks
audio_queue = queue.Queue()

# Initialize Whisper ASR model
asr_model = WhisperModel("small")  # Use small/medium for GPU or CPU

# Initialize translation model (MarianMT)
mt_name = "Helsinki-NLP/opus-mt-en-hi"
mt_tokenizer = AutoTokenizer.from_pretrained(mt_name)
mt_model = AutoModelForSeq2SeqLM.from_pretrained(mt_name).to(
    "cuda" if torch.cuda.is_available() else "cpu"
)

# ----------------- AUDIO CALLBACK -----------------
def audio_callback(indata, frames, time_info, status):
    """Puts microphone audio into queue as float32 numpy array"""
    audio_queue.put(indata.copy())

# ----------------- HELPER FUNCTIONS -----------------
def translate_text(text):
    """Translate text using MarianMT"""
    inputs = mt_tokenizer(text, return_tensors="pt", truncation=True).to(mt_model.device)
    outputs = mt_model.generate(**inputs, max_new_tokens=128)
    return mt_tokenizer.decode(outputs[0], skip_special_tokens=True)

# ----------------- MAIN STREAM PROCESS -----------------
def main():
    print("Starting live translation... Press Ctrl+C to stop.")

    # Variables for sentence commit
    buffer_audio = np.zeros((0,), dtype=np.float32)
    provisional_text = ""
    committed_text = ""
    last_speech_time = time.time()

    # Start audio stream
    with sd.InputStream(channels=CHANNELS,
                        samplerate=SAMPLE_RATE,
                        dtype="float32",
                        callback=audio_callback):
        while True:
            try:
                chunk = audio_queue.get(timeout=1.0).flatten()
            except queue.Empty:
                # Check for pause to commit
                if provisional_text and (time.time() - last_speech_time > PAUSE_THRESHOLD):
                    committed_text += " " + provisional_text
                    provisional_text = ""
                    print("\nCommitted:", committed_text.strip())
                continue

            buffer_audio = np.concatenate([buffer_audio, chunk])

            # Process if we have enough audio
            if len(buffer_audio) >= int(SAMPLE_RATE * CHUNK_DURATION):
                process_chunk = buffer_audio[:int(SAMPLE_RATE * CHUNK_DURATION)]
                buffer_audio = buffer_audio[int(SAMPLE_RATE * CHUNK_DURATION):]

                # Run ASR
                segments, _ = asr_model.transcribe(process_chunk, language=SRC_LANG, beam_size=5)
                asr_text = " ".join([seg.text for seg in segments]).strip()
                if not asr_text:
                    continue

                last_speech_time = time.time()

                # Translate ASR output
                translated = translate_text(asr_text)
                provisional_text = translated

                # Display provisional text
                print("\rProvisional:", committed_text + " " + provisional_text, end="")

if __name__ == "__main__":
    main()


# temp commit