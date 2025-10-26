import pino from 'pino';
import opcuaPkg from 'node-opcua';
const { OPCUAServer, Variant, DataType } = opcuaPkg;

// Contract similar to client driver:
// - ctor(opts): { port, endpoint, cert, key, ca, nodes: { [tag_id]: { nodeId, dataType } }, readFrom: 'memory'|'tsdb', memory: Map }
// - start()/stop()
// - update(tag_id, v) to reflect live values

export class OPCUAServerDriver {
  constructor(opts) {
    this.port = Number(opts.port || 4841);
    this.endpoint = opts.endpoint || `opc.tcp://0.0.0.0:${this.port}`;
    this.nodes = opts.nodes || {}; // tag_id -> { nodeId, dataType }
    this.readFrom = opts.readFrom || 'memory';
    this.memory = opts.memory || new Map();
    this.server = null;
    this.namespace = null;
    this.log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'opcua-server' });
  this.typeMap = new Map(); // tag_id -> dataType string
  }

  listActiveTagIds() {
    try { return Array.from(this.typeMap.keys()); } catch { return []; }
  }

  async removeTag(tagId) {
    // Simple approach: remove from maps; node stays in address space (OPC UA spec discourages mid-run structural deletes)
    // But removal prevents further updates/publishing and ensures reconciliation sees it absent.
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) return;
    let removed = false;
    try { if (this.typeMap.delete(tid)) removed = true; } catch {}
    try { if (this.memory.has(tid)) { this.memory.delete(tid); removed = true; } } catch {}
    if (removed) this.log.info({ tagId: tid }, 'OPCUA server logically removed tag');
  }

  async start() {
    this.server = new OPCUAServer({
      port: this.port,
      buildInfo: { productName: 'DataForeman-OPCUA', buildNumber: '1', buildDate: new Date() },
    });
    await this.server.initialize();
    const addressSpace = this.server.engine.addressSpace || this.server.engine.getAddressSpace?.();
    if (!addressSpace || !addressSpace.rootFolder?.objects) {
      throw new Error('addressSpace not ready');
    }
  const ns = addressSpace.getOwnNamespace();
  this.namespace = ns;
  const device = ns.addFolder(addressSpace.rootFolder.objects, { browseName: 'DataForeman' });
    // Expose variables per node mapping
    for (const [tagIdStr, def] of Object.entries(this.nodes)) {
      const tagId = Number(tagIdStr);
      const name = `Tag_${tagId}`;
      const dataType = def?.dataType || 'Double';
      this.typeMap.set(tagId, dataType);
      const coerce = (dt, v) => {
        switch (dt) {
          case 'Boolean': return Boolean(v);
          case 'String': return v == null ? '' : String(v);
          case 'Float':
          case 'Double':
          case 'Int32':
          case 'UInt32':
          default:
            return Number.isFinite(Number(v)) ? Number(v) : 0;
        }
      };
      let getter = () => {
        const dt = this.typeMap.get(tagId) || 'Double';
        const v = this.memory.has(tagId) ? this.memory.get(tagId) : (dt === 'Boolean' ? false : dt === 'String' ? '' : 0);
        return coerce(dt, v);
      };
      let setter = (value) => {
        const dt = this.typeMap.get(tagId) || 'Double';
        this.memory.set(tagId, coerce(dt, value));
        return opcuaPkg.StatusCodes.Good;
      };
      ns.addVariable({
        componentOf: device,
        browseName: name,
        nodeId: def?.nodeId || `s=DF.${tagId}`,
        dataType,
        value: {
          get: () => new Variant({ dataType: DataType[dataType] ?? DataType.Double, value: getter() }),
          set: (variant) => setter(variant.value),
        },
      });
    }
    await this.server.start();
    this.log.info({ endpoint: this.server.getEndpointUrl() }, 'OPCUA server started');
    return this.server.getEndpointUrl();
  }

  async stop() {
    try { await this.server?.shutdown(1000); } catch {}
    this.server = null;
  }

  update(tag_id, v) { this.memory.set(Number(tag_id), v); }
}
