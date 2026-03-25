function trafficGen() {
  return {
    // State
    testCaseList: [
      { key: 'appControl', label: 'Application Control', enabled: true, useCustom: false, uploadInfo: null },
      { key: 'generalWeb', label: 'General Web Traffic', enabled: true, useCustom: false, uploadInfo: null },
      { key: 'malware',    label: 'Malware (vxvault)',   enabled: false, useCustom: false, uploadInfo: null },
    ],
    interfaces: [],
    selectedIps: [],
    repeatCount: 1,
    vxvault: { timestamp: null, count: 0, loading: false, error: null },
    isRunning: false,
    statusMessage: '',
    categoryCards: [],
    requests: [],
    currentRunId: null,
    sseSource: null,
    _requestSeq: 0,

    get canStart() {
      return this.selectedIps.length > 0
        && this.testCaseList.some(tc => tc.enabled)
        && !this.isRunning
        && this.repeatCount >= 1;
    },

    async init() {
      await Promise.all([this.loadInterfaces(), this.loadUrlLists(), this.loadVxvaultStatus()]);
    },

    async loadInterfaces() {
      const res = await fetch('/api/interfaces');
      this.interfaces = await res.json();
    },

    async loadUrlLists() {
      const res = await fetch('/api/url-lists');
      const data = await res.json();
      for (const tc of this.testCaseList) {
        const info = data[tc.key];
        tc.uploadInfo = info?.custom;
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

      const testCases = this.testCaseList.filter(tc => tc.enabled).map(tc => tc.key);
      const customLists = {};
      for (const tc of this.testCaseList) {
        if (tc.enabled) customLists[tc.key] = tc.useCustom ? 'custom' : 'builtin';
      }

      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases,
          sourceIps: this.selectedIps,
          repeatCount: this.repeatCount,
          customLists,
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
            time: new Date().toLocaleTimeString(),
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
      };

      this.sseSource.onerror = () => {
        // Run continues server-side; just close the stream client-side
        this.sseSource.close();
      };
    },

    async stopRun() {
      await fetch('/api/test/stop', { method: 'POST' });
      this.statusMessage = 'Stopping…';
    },

    formatDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString();
    },
  };
}
