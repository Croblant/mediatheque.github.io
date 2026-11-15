class RealSheetPlayback {
  constructor(btnId) {
    this.btn = document.getElementById(btnId);
    this.synth = null;
    this.timing = null;
    this.visualObj = null;
    this.isPlaying = false;
  }

  setVisualObj(visualObj) {
    this.stop();
    this.visualObj = visualObj;
  }

  async toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      await this.play();
    }
  }

  async play() {
    if (!this.visualObj || !window.ABCJS || !ABCJS.synth.supportsAudio()) return;

    var ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') await ac.resume();

    this.synth = new ABCJS.synth.CreateSynth();
    await this.synth.init({
      visualObj: this.visualObj,
      audioContext: ac,
      millisecondsPerMeasure: this.visualObj.millisecondsPerMeasure()
    });
    await this.synth.prime();

    var self = this;
    this.timing = new ABCJS.TimingCallbacks(this.visualObj, {
      eventCallback: function (ev) {
        if (ev === null) {
          self.stop();
          return;
        }
        document.querySelectorAll('.abcjs-highlight').forEach(function (el) {
          el.classList.remove('abcjs-highlight');
        });
        if (ev.elements) {
          ev.elements.forEach(function (grp) {
            grp.forEach(function (el) {
              el.classList.add('abcjs-highlight');
            });
          });
        }
      }
    });

    this.synth.start();
    this.timing.start();
    this.updateButton(true);
  }

  stop() {
    if (this.timing) {
      try { this.timing.stop(); } catch (e) {}
      this.timing = null;
    }
    if (this.synth) {
      try { this.synth.stop(); } catch (e) {}
      this.synth = null;
    }
    document.querySelectorAll('.abcjs-highlight').forEach(function (el) {
      el.classList.remove('abcjs-highlight');
    });
    this.updateButton(false);
  }

  updateButton(playing) {
    this.isPlaying = playing;
    if (this.btn) {
      this.btn.textContent = playing ? '■' : '▶';
    }
  }
}

window.RealSheetPlayback = RealSheetPlayback;