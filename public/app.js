function trafficGen() {
  return {
    // State
    testCaseList: [
      { key: 'appControl', label: 'Application Control', standardEnabled: true, heavyEnabled: false, useCustom: false, uploadInfo: null, builtinModified: false, heavyBuiltinModified: false },
      { key: 'generalWeb', label: 'General Web Traffic', enabled: true, useCustom: false, uploadInfo: null, builtinModified: false },
      { key: 'malware',    label: 'Malware (vxvault)',   enabled: false, useCustom: false, uploadInfo: null, builtinModified: false, urlhausEnabled: false },
    ],
    editor: { testCase: null, label: '', entries: [], dirty: false, saving: false, isDefault: true },
    interfaces: [],
    selectedIps: [],
    runtimeMinutes: 10,
    elapsedSeconds: 0,
    totalSeconds: 0,
    vxvault: { timestamp: null, count: 0, loading: false, error: null },
    urlhaus: { timestamp: null, count: 0, loading: false, error: null },
    isRunning: false,
    statusMessage: '',
    categoryCards: [],
    requests: [],
    currentRunId: null,
    sseSource: null,
    _requestSeq: 0,

    get canStart() {
      const ac = this.testCaseList.find(tc => tc.key === 'appControl');
      const mal = this.testCaseList.find(tc => tc.key === 'malware');
      const appControlActive = ac ? (ac.standardEnabled || ac.heavyEnabled) : false;
      const urlhausActive = mal?.urlhausEnabled ?? false;
      const othersActive = this.testCaseList
        .filter(tc => tc.key !== 'appControl')
        .some(tc => tc.enabled);
      return (appControlActive || othersActive || urlhausActive)
        && this.selectedIps.length > 0
        && !this.isRunning
        && this.runtimeMinutes >= 1;
    },

    async init() {
      await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus(), this.loadUrlhausStatus()]);
    },

    async loadInterfaces() {
      const res = await fetch('/api/interfaces');
      this.interfaces = await res.json();
    },

    async loadUrlLists() {
      const res = await fetch('/api/url-lists');
      const data = await res.json();
      for (const tc of this.testCaseList) {
        if (tc.key === 'appControl') {
          const info = data['appControl'];
          tc.uploadInfo = info?.custom;
          tc.builtinModified = info?.builtinModified ?? false;
          tc.heavyBuiltinModified = data['appControlHeavy']?.builtinModified ?? false;
        } else {
          const info = data[tc.key];
          tc.uploadInfo = info?.custom;
          tc.builtinModified = info?.builtinModified ?? false;
        }
      }
    },

    async loadVxvaultStatus() {
      const res = await fetch('/api/vxvault/status');
      const data = await res.json();
      this.vxvault.timestamp = data.timestamp;
      this.vxvault.count = data.count;
    },

    async refreshVxvault() {
      this.vxvault.loading = true;
      this.vxvault.error = null;
      try {
        const res = await fetch('/api/vxvault/refresh', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Refresh failed');
        this.vxvault.timestamp = data.timestamp;
        this.vxvault.count = data.count;
      } catch (e) {
        this.vxvault.error = e.message;
      } finally {
        this.vxvault.loading = false;
      }
    },

    async loadUrlhausStatus() {
      const res = await fetch('/api/urlhaus/status');
      const data = await res.json();
      this.urlhaus.timestamp = data.timestamp;
      this.urlhaus.count = data.count;
    },

    async refreshUrlhaus() {
      this.urlhaus.loading = true;
      this.urlhaus.error = null;
      try {
        const res = await fetch('/api/urlhaus/refresh', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Refresh failed');
        this.urlhaus.timestamp = data.timestamp;
        this.urlhaus.count = data.count;
      } catch (e) {
        this.urlhaus.error = e.message;
      } finally {
        this.urlhaus.loading = false;
      }
    },

    async openEditor(tcKey, tcLabel) {
      const res = await fetch(`/api/url-lists/${tcKey}/builtin`);
      const data = await res.json();
      this.editor = { testCase: tcKey, label: tcLabel, entries: data.entries.map(e => ({ ...e })), dirty: false, saving: false, isDefault: data.isDefault };
    },

    closeEditor() {
      this.editor = { testCase: null, label: '', entries: [], dirty: false, saving: false, isDefault: true };
    },

    addEditorRow() {
      this.editor.entries.push({ name: '', url: '', category: '' });
      this.editor.dirty = true;
    },

    removeEditorRow(i) {
      this.editor.entries.splice(i, 1);
      this.editor.dirty = true;
    },

    async saveBuiltin() {
      this.editor.saving = true;
      try {
        const res = await fetch(`/api/url-lists/${this.editor.testCase}/builtin`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editor.entries),
        });
        const data = await res.json();
        if (!res.ok) { alert('Save failed: ' + (data.errors?.join('\n') || data.error)); return; }
        this.editor.dirty = false;
        this.editor.isDefault = false;
        await this.loadUrlLists();
      } finally {
        this.editor.saving = false;
      }
    },

    async resetBuiltin() {
      if (!confirm('Reset to default list? Your edits will be lost.')) return;
      await fetch(`/api/url-lists/${this.editor.testCase}/builtin`, { method: 'DELETE' });
      const res = await fetch(`/api/url-lists/${this.editor.testCase}/builtin`);
      const data = await res.json();
      this.editor.entries = data.entries.map(e => ({ ...e }));
      this.editor.dirty = false;
      this.editor.isDefault = true;
      await this.loadUrlLists();
    },

    triggerUpload(tcKey) {
      document.getElementById('upload-' + tcKey).click();
    },

    async handleUpload(tcKey, event) {
      const file = event.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('testCase', tcKey);
      const res = await fetch('/api/url-lists/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert('Upload failed: ' + (data.errors?.join('\n') || data.error));
        return;
      }
      await this.loadUrlLists();
      const tc = this.testCaseList.find(t => t.key === tcKey);
      if (tc) tc.useCustom = true;
    },

    async deleteUpload(tcKey) {
      await fetch('/api/url-lists/' + tcKey, { method: 'DELETE' });
      const tc = this.testCaseList.find(t => t.key === tcKey);
      if (tc) { tc.uploadInfo = null; tc.useCustom = false; }
    },

    async startRun() {
      this.statusMessage = '';
      this.categoryCards = [];
      this.requests = [];
      this._requestSeq = 0;
      this.elapsedSeconds = 0;
      this.totalSeconds = 0;

      const ac = this.testCaseList.find(tc => tc.key === 'appControl');
      const mal = this.testCaseList.find(tc => tc.key === 'malware');
      const testCases = [
        ...(ac?.standardEnabled ? ['appControl'] : []),
        ...this.testCaseList.filter(tc => tc.key !== 'appControl' && tc.enabled).map(tc => tc.key),
      ];
      const customLists = {};
      if (ac?.standardEnabled) customLists['appControl'] = ac.useCustom ? 'custom' : 'builtin';
      for (const tc of this.testCaseList.filter(t => t.key !== 'appControl' && t.enabled)) {
        customLists[tc.key] = tc.useCustom ? 'custom' : 'builtin';
      }

      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          sourceIps: this.selectedIps,
          runtimeMinutes: this.runtimeMinutes,
          customLists,
          includeHeavyAppControl: ac?.heavyEnabled ?? false,
          includeUrlhaus: mal?.urlhausEnabled ?? false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        this.statusMessage = 'Error: ' + data.error;
        return;
      }

      this.currentRunId = data.runId;
      this.isRunning = true;
      this.statusMessage = 'Running…';
      this.connectSse(data.runId);
    },

    connectSse(runId) {
      if (this.sseSource) this.sseSource.close();
      this.sseSource = new EventSource('/api/test/' + runId + '/stream');

      this.sseSource.onmessage = (event) => {
        const e = JSON.parse(event.data);

        if (e.type === 'request') {
          this.requests.unshift({
            _id: ++this._requestSeq,
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            testCase: e.testCase,
            category: e.category,
            url: e.url,
            sourceIp: e.sourceIp,
            status: e.status,
            statusCode: e.statusCode,
            responseTime: e.responseTime,
            error: e.error,
          });
        }

        if (e.type === 'summary') {
          const key = e.testCase + ':' + e.category;
          const existing = this.categoryCards.find(c => c.key === key);
          if (existing) {
            existing.total = e.total;
            existing.success = e.success;
            existing.failed = e.failed;
          } else {
            this.categoryCards.push({ key, testCase: e.testCase, category: e.category, total: e.total, success: e.success, failed: e.failed });
          }
        }

        if (e.type === 'done') {
          this.isRunning = false;
          this.statusMessage = `Done — ${e.totalRequests} requests, ${e.totalSuccess} success, ${e.totalFailed} failed`;
          this.sseSource.close();
        }

        if (e.type === 'progress') {
          this.elapsedSeconds = e.elapsedSeconds;
          this.totalSeconds = e.totalSeconds;
        }
      };

      this.sseSource.onerror = () => {
        this.sseSource.close();
        this.isRunning = false;
        this.statusMessage = 'Connection lost — the run may still be active server-side.';
      };
    },

    async stopRun() {
      await fetch('/api/test/stop', { method: 'POST' });
      this.isRunning = false;
      this.statusMessage = 'Stopping…';
    },

    formatDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString();
    },

    formatRemaining() {
      const remaining = Math.max(0, this.totalSeconds - this.elapsedSeconds);
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      return `${m}:${s.toString().padStart(2, '0')} left`;
    },
  };
}
