import { Camera, Color, Scene, Texture, Vector2, Vector4, WebGLRenderer } from 'three';
import { ClearPass } from 'three/examples/jsm/postprocessing/ClearPass';
import { EffectComposer, Pass } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';

export type ResizeViewCallback = (view: View, size: Vector2) => void;

export type ViewProps = {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
    renderTargetSize: Vector2;
    viewport?: Vector4;
    scissor?: Vector4;
    clearColor?: boolean | Color;
    clearDepth?: boolean;
    clearStencil?: boolean;
    backgroundEffects?: Array<Pass>;
    postProcessingEffects?: Array<Pass>;
    onResize?: ResizeViewCallback;
}

export class View {
    constructor({
        renderer,
        scene,
        camera,
        renderTargetSize,
        viewport,
        scissor,
        clearColor = true,
        clearDepth = true,
        clearStencil = true,
        backgroundEffects = new Array<Pass>(),
        postProcessingEffects = new Array<Pass>(),
        onResize,
    }: ViewProps) {
        this._scene = scene;
        this._camera = camera;
        this._renderTargetSize = renderTargetSize;
        this._viewport = viewport;
        this._cachedViewport = viewport || new Vector4(0, 0, renderTargetSize.width, renderTargetSize.height);
        this._scissor = scissor;
        this._clearColor = clearColor;
        this._clearDepth = clearDepth;
        this._clearStencil = clearStencil;
        this._onResize = onResize;

        this._backgroundEffects = backgroundEffects;
        this._postProcessingEffects = postProcessingEffects;

        const composer = new EffectComposer(renderer);

        const renderPass = new RenderPass(this._scene, this._camera);
        renderPass.clear = false;
        composer.render()
    }

    get scene(): Scene {
        return this._scene;
    }
    set scene(value: Scene) {
        this._scene = value;
    }

    get camera(): Camera {
        return this._camera;
    }
    set camera(value: Camera) {
        this._camera = value;
    }

    get renderTargetSize(): Vector2 {
        return this._renderTargetSize;
    }

    get viewport(): Vector4 | undefined {
        return this._viewport;
    }
    set viewport(value: Vector4 | undefined) {
        this._viewport = value;
        this._cachedViewport = value || new Vector4(0, 0, this._renderTargetSize.width, this._renderTargetSize.height);
    }

    get scissor(): Vector4 | undefined {
        return this._scissor || this._viewport;
    }
    set scissor(value: Vector4 | undefined) {       
        this._scissor = value;
    }

    get clearColor(): boolean | Color {
        return this._clearColor;
    }
    set clearColor(value: boolean | Color) {
        this._clearColor = value;
    }

    get clearDepth(): boolean {
        return this._clearDepth;
    }
    set clearDepth(value: boolean) {
        this._clearDepth = value;
    }

    get clearStencil(): boolean {
        return this._clearStencil;
    }
    set clearStencil(value: boolean) {
        this._clearStencil = value;
    }

    get backgroundEffects(): Array<Pass> {
        return this._backgroundEffects;
    }

    get postProcessingEffects(): Array<Pass> {
        return this._postProcessingEffects;
    }

    public onResize(renderTargetSize: Vector2) {
        this._renderTargetSize = renderTargetSize;

        if (typeof this._onResize === 'function') {
            this._onResize(this, renderTargetSize);
        }
        
        if (!this.viewport) {
            this._cachedViewport = new Vector4(0, 0, renderTargetSize.width, renderTargetSize.height);
        }
    }

    public render(renderer: WebGLRenderer): void {
        // Store initial renderer state
        const initialAutoClear = renderer.autoClear;
        renderer.autoClear = false;

        const initialViewport = new Vector4();
        renderer.getViewport(initialViewport);

        const initialScissor = new Vector4();
        renderer.getScissor(initialScissor);

        const initialScissorTest = renderer.getScissorTest();

        const initialClearColor = new Color();
        renderer.getClearColor(initialClearColor);

        // Setup the renderer
        renderer.setViewport(this._cachedViewport);

        if (this._scissor) {
            renderer.setScissor(this._scissor);
            renderer.setScissorTest(true);
        } else {
            renderer.setScissor(this._cachedViewport);
            renderer.setScissorTest(false);
        }

        if (this.clearColor) {
            if (this.clearColor instanceof Color) {
                renderer.setClearColor(this.clearColor);
            }
            
            renderer.clearColor();
        }

        if (this.clearDepth) {
            renderer.clearDepth();
        }

        if (this.clearStencil) {
            renderer.clearStencil();
        }

        // Render the scene
        renderer.render(this._scene, this._camera);

        // Restore initial renderer state
        renderer.autoClear = initialAutoClear;
        renderer.setViewport(initialViewport);
        renderer.setScissor(initialScissor);
        renderer.setScissorTest(initialScissorTest);
        renderer.setClearColor(initialClearColor);
    }

    private _scene: Scene;
    private _camera: Camera;
    private _renderTargetSize: Vector2;
    private _viewport?: Vector4;
    private _cachedViewport: Vector4;
    private _scissor?: Vector4;
    private _clearColor: boolean | Color;
    private _clearDepth: boolean;
    private _clearStencil: boolean;
    private _backgroundEffects: Array<Pass>;
    private _postProcessingEffects: Array<Pass>;
    private _onResize?: ResizeViewCallback;
}