import { Camera, Color, ColorRepresentation, Object3D, Scene, Vector2, Vector4, WebGLRenderer } from 'three';
import { EffectComposer, Pass } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { SSAARenderPass } from 'three/examples/jsm/postprocessing/SSAARenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader';

export class SceneNode {
    constructor() {
        this._scene = new Scene();
    }

    public animate(delta: number): void {
        const obj = new Object3D();
    }

    protected _scene: Scene;
}

export type ResizeViewCallback = (view: View, size: Vector2) => void;

export type ViewProps = {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: Camera;
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
        viewport,
        scissor,
        clearColor,
        clearDepth,
        clearStencil,
        onResize,
    }: ViewProps) {
        const rendererSize = new Vector2();
        renderer.getSize(rendererSize);

        console.log(clearColor);

        clearColor ??= true;
        clearDepth ??= true;
        clearStencil ??= true;

        console.log(clearColor);

        this._renderer = renderer;
        this._scene = scene;
        this._camera = camera;
        this._renderTargetSize = rendererSize;
        this._viewport = viewport;
        this._cachedViewport = viewport || new Vector4(0, 0, rendererSize.width, rendererSize.height);
        this._cachedViewportSize = new Vector2(this._cachedViewport.width, this._cachedViewport.height);
        this._scissor = scissor;
        this._clearColor = clearColor;
        this._clearDepth = clearDepth;
        this._clearStencil = clearStencil;
        this._onResize = onResize;
    }

    get renderer(): WebGLRenderer {
        return this._renderer;
    }
    set renderer(value: WebGLRenderer) {
        this._renderer = value;
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
        this._cachedViewportSize = new Vector2(this._cachedViewport.width, this._cachedViewport.height);
    }

    get viewportSize(): Vector2 {
        return this._cachedViewportSize;
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

    public onResize(renderTargetSize: Vector2) {
        this._renderTargetSize = renderTargetSize;

        if (typeof this._onResize === 'function') {
            this._onResize(this, renderTargetSize);
        }
        
        if (!this.viewport) {
            this._cachedViewport = new Vector4(0, 0, renderTargetSize.width, renderTargetSize.height);
            this._cachedViewportSize = new Vector2(this._cachedViewport.width, this._cachedViewport.height);
        }
    }

    public render(): void {
        // Store initial renderer state
        const initialAutoClear = this._renderer.autoClear;
        this._renderer.autoClear = false;

        this._renderer.getViewport(this._oldViewport);

        this._renderer.getScissor(this._oldScissor);

        const initialScissorTest = this._renderer.getScissorTest();

        this._renderer.getClearColor(this._oldClearColor);

        const initialClearAlpha = this._renderer.getClearAlpha();

        if (this._clearColor instanceof Color) {
            this._renderer.setClearColor(this._clearColor);
        }

        if (this._viewport) {
            // Setup the renderer
            this._renderer.setViewport(this._cachedViewport);
        }

        if (this._scissor) {
            this._renderer.setScissor(this._scissor);
            this._renderer.setScissorTest(true);
        } else if (this._viewport) {
            this._renderer.setScissor(this._viewport);
            this._renderer.setScissorTest(false);
        }

        this.renderCore();

        // Restore initial renderer state
        this._renderer.autoClear = initialAutoClear;
        this._renderer.setViewport(this._oldViewport);
        this._renderer.setScissor(this._oldScissor);
        this._renderer.setScissorTest(initialScissorTest);
        this._renderer.setClearColor(this._oldClearColor, initialClearAlpha);
    }

    protected renderCore() {
        if (this.clearColor) {
            if (this.clearColor instanceof Color) {
                this._renderer.setClearColor(this.clearColor);
            }
            
            this._renderer.clearColor();
        }

        if (this.clearDepth) {
            this._renderer.clearDepth();
        }

        if (this.clearStencil) {
            this._renderer.clearStencil();
        }

        // Render the scene
        this._renderer.render(this._scene, this._camera);
    }

    protected _renderer: WebGLRenderer;
    protected _scene: Scene;
    protected _camera: Camera;
    protected _renderTargetSize: Vector2;
    protected _viewport?: Vector4;
    protected _cachedViewport: Vector4;
    protected _cachedViewportSize: Vector2;
    protected _scissor?: Vector4;
    protected _clearColor: boolean | Color;
    protected _clearDepth: boolean;
    protected _clearStencil: boolean;
    protected _onResize?: ResizeViewCallback;

    private _oldViewport: Vector4 = new Vector4();
    private _oldScissor: Vector4 = new Vector4();
    private _oldClearColor: Color = new Color();
}

export type EffectViewProps = ViewProps & {
    backgroundEffects?: Array<Pass>;
    postProcessingEffects?: Array<Pass>;
    antialias?: boolean;
}

export class EffectView extends View {
    constructor({
        backgroundEffects = new Array<Pass>(),
        postProcessingEffects = new Array<Pass>(),
        antialias = false,
        ...rest
    }: EffectViewProps) {
        super({...rest});

        this._backgroundEffects = backgroundEffects;
        this._postProcessingEffects = postProcessingEffects;

        this._effectComposer = new EffectComposer(this._renderer);

        this._backgroundEffects.forEach((pass) => this._effectComposer.addPass(pass));

        this._renderPass = antialias ? new SSAARenderPass(this._scene, this._camera, 'black', 0.0) : new RenderPass(this._scene, this._camera);
        this._renderPass.clear = !!rest.clearColor;
        this._effectComposer.addPass(this._renderPass);

        const copyPass = new ShaderPass( CopyShader );
        this._effectComposer.addPass( copyPass );

        this._postProcessingEffects.forEach((pass) => this._effectComposer.addPass(pass));
    }

    set camera(camera: Camera) {
        this._camera = camera;
        this._renderPass.camera = camera;
    }

    get backgroundEffects(): Array<Pass> {
        return this._backgroundEffects;
    }

    get postProcessingEffects(): Array<Pass> {
        return this._postProcessingEffects;
    }

    get effectComposer(): EffectComposer {
        return this._effectComposer;
    }

    public onResize(renderTargetSize: Vector2): void {
        super.onResize(renderTargetSize);

        this._effectComposer.setSize(this._cachedViewportSize.width, this._cachedViewportSize.height);
    }

    protected renderCore(): void {
        this._effectComposer.render();
    }

    protected _backgroundEffects: Array<Pass>;
    protected _postProcessingEffects: Array<Pass>;
    protected _effectComposer: EffectComposer;
    protected _renderPass: RenderPass | SSAARenderPass;
}