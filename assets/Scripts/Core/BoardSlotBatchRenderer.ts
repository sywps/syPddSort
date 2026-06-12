import {
    _decorator,
    IAssembler,
    IRenderData,
    InstanceMaterialType,
    Material,
    RenderData,
    SpriteFrame,
    UIRenderer,
} from 'cc';

const { ccclass } = _decorator;

const COCOS_DEFAULT_BATCHER2D_MAX_VERTICES = 4096;
export const BOARD_SLOT_BATCH_MAX_CELLS = Math.floor(COCOS_DEFAULT_BATCHER2D_MAX_VERTICES / 4);

export type BoardSlotBatchCell = {
    x: number;
    y: number;
    size: number;
    spriteFrame: SpriteFrame;
};

type PreparedBoardSlotCell = {
    x: number;
    y: number;
    size: number;
    uv: number[];
};

const boardSlotBatchAssembler: IAssembler = {
    createData(comp: UIRenderer): RenderData {
        const batch = comp as BoardSlotBatchRenderer;
        const cellCount = batch.getPreparedCells().length;
        const renderData = batch.requestRenderData();
        renderData.dataLength = cellCount * 4;
        renderData.resize(cellCount * 4, cellCount * 6);
        if (!renderData.chunk) {
            throw new Error(`[BoardSlotBatch] failed to allocate render chunk for ${cellCount} quads`);
        }
        if (cellCount > 0) {
            renderData.chunk.setIndexBuffer(buildQuadIndices(cellCount));
        }
        return renderData;
    },

    updateRenderData(comp: UIRenderer): void {
        const batch = comp as BoardSlotBatchRenderer;
        const renderData = batch.renderData as RenderData | null;
        const textureFrame = batch.textureFrame;
        if (!renderData || !textureFrame) return;
        const expectedVertexCount = batch.getPreparedCells().length * 4;
        if (renderData.dataLength !== expectedVertexCount) {
            batch.rebuildRenderDataForBatch();
            return;
        }
        updateLocalVerts(batch, renderData);
        updateUVs(batch, renderData);
        updateColor(batch, renderData);
        renderData.updateRenderData(batch, textureFrame);
    },

    fillBuffers(comp: UIRenderer): void {
        const batch = comp as BoardSlotBatchRenderer;
        const renderData = batch.renderData as RenderData | null;
        if (!renderData) return;

        const transformVersion = Number((batch.node as any).flagChangedVersion || 0);
        if (renderData.vertDirty || batch.lastTransformVersion !== transformVersion) {
            updateWorldVerts(batch, renderData);
            renderData.vertDirty = false;
            batch.lastTransformVersion = transformVersion;
        }

        const cellCount = batch.getPreparedCells().length;
        const chunk = renderData.chunk;
        const meshBuffer = chunk.meshBuffer;
        const ib = meshBuffer.iData;
        let indexOffset = meshBuffer.indexOffset;
        const vertexOffset = chunk.vertexOffset;
        for (let i = 0; i < cellCount; i++) {
            const vid = vertexOffset + i * 4;
            ib[indexOffset++] = vid;
            ib[indexOffset++] = vid + 1;
            ib[indexOffset++] = vid + 2;
            ib[indexOffset++] = vid + 1;
            ib[indexOffset++] = vid + 3;
            ib[indexOffset++] = vid + 2;
        }
        meshBuffer.indexOffset += cellCount * 6;
    },

    updateColor(comp: UIRenderer): void {
        const batch = comp as BoardSlotBatchRenderer;
        const renderData = batch.renderData as RenderData | null;
        if (renderData) updateColor(batch, renderData);
    },
};

@ccclass('BoardSlotBatchRenderer')
export class BoardSlotBatchRenderer extends UIRenderer {
    private _cells: PreparedBoardSlotCell[] = [];
    private _textureFrame: SpriteFrame | null = null;
    lastTransformVersion = -1;

    get textureFrame(): SpriteFrame | null {
        return this._textureFrame;
    }

    get visibleCellCount(): number {
        return this._cells.length;
    }

    configure(cells: BoardSlotBatchCell[]): void {
        if (cells.length > BOARD_SLOT_BATCH_MAX_CELLS) {
            throw new Error(`[BoardSlotBatch] too many slot quads: ${cells.length}`);
        }
        const textureFrame = cells[0]?.spriteFrame || null;
        const texture = textureFrame?.texture || null;
        const prepared: PreparedBoardSlotCell[] = [];
        for (const cell of cells) {
            if (!cell.spriteFrame?.texture) {
                throw new Error('[BoardSlotBatch] missing slot sprite texture');
            }
            if (texture && cell.spriteFrame.texture !== texture) {
                throw new Error('[BoardSlotBatch] slot sprite frames must share one atlas texture');
            }
            prepared.push({
                x: cell.x,
                y: cell.y,
                size: cell.size,
                uv: cell.spriteFrame.uv.slice(0, 8),
            });
        }
        const vertexCountChanged = (this.renderData as RenderData | null)?.dataLength !== prepared.length * 4;
        this._cells = prepared;
        this._textureFrame = textureFrame;
        this.lastTransformVersion = -1;
        if (vertexCountChanged) {
            this.destroyRenderData();
        }
        this.flushBatchAssembler();
        this.markForUpdateRenderData();
    }

    clear(): void {
        this._cells = [];
        this._textureFrame = null;
        this.lastTransformVersion = -1;
        this.destroyRenderData();
        this.markForUpdateRenderData();
    }

    getPreparedCells(): PreparedBoardSlotCell[] {
        return this._cells;
    }

    rebuildRenderDataForBatch(): void {
        this.destroyRenderData();
        this.flushBatchAssembler();
        this.markForUpdateRenderData();
    }

    private flushBatchAssembler(): void {
        (this as any)._instanceMaterialType = InstanceMaterialType.ADD_COLOR_AND_TEXTURE;
        if ((this as any)._assembler !== boardSlotBatchAssembler) {
            this.destroyRenderData();
            (this as any)._assembler = boardSlotBatchAssembler;
        }
        if (!this.renderData && this._textureFrame && this._cells.length > 0) {
            const renderData = boardSlotBatchAssembler.createData!(this) as RenderData;
            renderData.material = this.getRenderMaterial(0) as Material | null;
            (this as any)._renderData = renderData;
        }
    }

    protected _render(render: any): void {
        if (!this._textureFrame || !(this as any)._assembler) return;
        render.commitComp(this, this.renderData, this._textureFrame, (this as any)._assembler, null);
    }

    protected _canRender(): boolean {
        return super._canRender()
            && !!this._textureFrame?.texture
            && this._cells.length > 0
            && !!this.renderData;
    }
}

function buildQuadIndices(cellCount: number): Uint16Array {
    const indices = new Uint16Array(cellCount * 6);
    let offset = 0;
    for (let i = 0; i < cellCount; i++) {
        const vid = i * 4;
        indices[offset++] = vid;
        indices[offset++] = vid + 1;
        indices[offset++] = vid + 2;
        indices[offset++] = vid + 1;
        indices[offset++] = vid + 3;
        indices[offset++] = vid + 2;
    }
    return indices;
}

function updateLocalVerts(batch: BoardSlotBatchRenderer, renderData: RenderData): void {
    const cells = batch.getPreparedCells();
    const data = renderData.data as IRenderData[];
    let vertexIndex = 0;
    for (const cell of cells) {
        const half = cell.size / 2;
        const l = cell.x - half;
        const r = cell.x + half;
        const b = cell.y - half;
        const t = cell.y + half;
        data[vertexIndex].x = l;
        data[vertexIndex].y = b;
        data[vertexIndex].z = 0;
        vertexIndex++;
        data[vertexIndex].x = r;
        data[vertexIndex].y = b;
        data[vertexIndex].z = 0;
        vertexIndex++;
        data[vertexIndex].x = l;
        data[vertexIndex].y = t;
        data[vertexIndex].z = 0;
        vertexIndex++;
        data[vertexIndex].x = r;
        data[vertexIndex].y = t;
        data[vertexIndex].z = 0;
        vertexIndex++;
    }
    renderData.vertDirty = true;
}

function updateWorldVerts(batch: BoardSlotBatchRenderer, renderData: RenderData): void {
    const vData = renderData.chunk.vb;
    const data = renderData.data as IRenderData[];
    const m = batch.node.worldMatrix;
    const m00 = m.m00; const m01 = m.m01; const m02 = m.m02; const m03 = m.m03;
    const m04 = m.m04; const m05 = m.m05; const m06 = m.m06; const m07 = m.m07;
    const m12 = m.m12; const m13 = m.m13; const m14 = m.m14; const m15 = m.m15;
    const stride = renderData.floatStride;
    for (let i = 0; i < data.length; i++) {
        const cur = data[i];
        const x = cur.x;
        const y = cur.y;
        let rhw = m03 * x + m07 * y + m15;
        rhw = rhw ? 1 / rhw : 1;
        const offset = i * stride;
        vData[offset] = (m00 * x + m04 * y + m12) * rhw;
        vData[offset + 1] = (m01 * x + m05 * y + m13) * rhw;
        vData[offset + 2] = (m02 * x + m06 * y + m14) * rhw;
    }
}

function updateUVs(batch: BoardSlotBatchRenderer, renderData: RenderData): void {
    const cells = batch.getPreparedCells();
    const vData = renderData.chunk.vb;
    const stride = renderData.floatStride;
    let vertexIndex = 0;
    for (const cell of cells) {
        for (let i = 0; i < 4; i++) {
            const offset = vertexIndex * stride + 3;
            const uvIndex = i * 2;
            vData[offset] = cell.uv[uvIndex];
            vData[offset + 1] = cell.uv[uvIndex + 1];
            vertexIndex++;
        }
    }
}

function updateColor(batch: BoardSlotBatchRenderer, renderData: RenderData): void {
    const vData = renderData.chunk.vb;
    const stride = renderData.floatStride;
    const color = batch.color;
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const a = color.a / 255;
    for (let i = 0; i < renderData.dataLength; i++) {
        const offset = i * stride + 5;
        vData[offset] = r;
        vData[offset + 1] = g;
        vData[offset + 2] = b;
        vData[offset + 3] = a;
    }
}
