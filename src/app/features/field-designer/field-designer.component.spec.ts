import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FieldDesignerComponent } from './field-designer.component';
import { PdfRenderService, PageInfo } from '../form-fill/pdf-render.service';

/**
 * Specs for placing fields by drawing them.
 *
 * The behaviour worth pinning is the coordinate flip. A box drawn near the
 * TOP of the rendered page has to end up with a HIGH y, because PDF space
 * measures y up from the bottom. Getting it backwards mirrors every field onto
 * the wrong half of the document — which renders as a plausible-looking form
 * rather than an obviously broken one, so nothing else catches it.
 */
describe('FieldDesignerComponent', () => {
  let fixture: ComponentFixture<FieldDesignerComponent>;
  let component: FieldDesignerComponent;
  let saved: { fields: unknown[]; version?: string } | null;

  const PAGE_HEIGHT = 842;
  const PAGE_WIDTH = 595;

  const DEFINITION = {
    id: 'form-1',
    title: 'Scanned Contract',
    version: '1.0.0',
    document: {
      url: '/forms/form-1/document',
      filename: 'scan.pdf',
      contentType: 'application/pdf',
      pages: [{ width: PAGE_WIDTH, height: PAGE_HEIGHT }],
      sha256: 'abc',
    },
    fields: [],
    origin: { source: 'converted', originalFilename: 'scan.pdf' },
  };

  /** Renders nothing: these specs are about geometry and editing, not pixels. */
  class StubRenderer {
    async load(): Promise<unknown> {
      return { numPages: 1 };
    }
    async describePage(_doc: unknown, index: number, scale: number): Promise<PageInfo> {
      return {
        index,
        cssWidth: PAGE_WIDTH * scale,
        cssHeight: PAGE_HEIGHT * scale,
        pdfWidth: PAGE_WIDTH,
        pdfHeight: PAGE_HEIGHT,
        scale,
      };
    }
    async renderPageInto(): Promise<void> {}
    fitScale(): number {
      // Deliberately not 1. A scale of 1 lets a missing multiply or divide
      // pass unnoticed, and the app never renders at 1:1 anyway.
      return 0.5;
    }
  }

  /**
   * A response object rather than a real Response.
   *
   * Response.json() reads the body through a task zone.js does not track, so
   * whenStable() resolves before the component has its definition and every
   * spec sees an unrendered page. A plain object keeps the whole chain in
   * zone-patched promises.
   */
  function reply(body: unknown, status = 200): Promise<Response> {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  }

  beforeEach(async () => {
    saved = null;
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body));
        return reply({ ...DEFINITION, ...saved, version: '1.1.0' });
      }
      if (url.includes('/forms/')) return reply(DEFINITION);
      return reply({}, 404);
    });

    await TestBed.configureTestingModule({
      imports: [FieldDesignerComponent],
      providers: [provideNoopAnimations(), { provide: PdfRenderService, useClass: StubRenderer }],
    }).compileComponents();

    fixture = TestBed.createComponent(FieldDesignerComponent);
    component = fixture.componentInstance;
    component.formId = 'form-1';

    // Mirrors how Angular drives it: an initial change detection pass runs the
    // view-init hooks, and only then does the definition arrive.
    fixture.detectChanges();
    component.ngOnChanges();
    await settle();
  });

  /**
   * Drains the load-then-render chain.
   *
   * whenStable() alone is not enough: loading awaits the definition, then
   * change detection, then the document, then a description per page. Each is
   * a further turn, and whenStable resolves after the first batch — leaving
   * pages empty and every drag with no surface to land on.
   */
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  }

  /** Drags a box on the first page, in CSS pixels from its top-left. */
  function drag(left: number, top: number, width: number, height: number): void {
    const page = (fixture.nativeElement as HTMLElement).querySelector('.page') as HTMLElement;
    expect(page).withContext('a page surface should be rendered').not.toBeNull();

    // jsdom-free but still synthetic: the component reads clientX/Y against
    // the element's own bounding box, so offset by wherever it actually sits.
    const box = page.getBoundingClientRect();
    const at = (x: number, y: number) =>
      ({ clientX: box.left + x, clientY: box.top + y, pointerId: 1, bubbles: true }) as PointerEventInit;

    page.setPointerCapture = () => {};
    page.releasePointerCapture = () => {};
    page.dispatchEvent(new PointerEvent('pointerdown', at(left, top)));
    page.dispatchEvent(new PointerEvent('pointermove', at(left + width, top + height)));
    page.dispatchEvent(new PointerEvent('pointerup', at(left + width, top + height)));
    fixture.detectChanges();
  }

  it('loads the document and shows it as having no fields yet', () => {
    expect(component.definition?.title).toBe('Scanned Contract');
    expect(component.fields.length).toBe(0);
    expect(component.pages.length).toBe(1);
  });

  it('places a field where the box was drawn', () => {
    component.kind = 'signature';
    drag(56, 100, 120, 40);

    expect(component.fields.length).toBe(1);
    const field = component.fields[0];
    expect(field.kind).toBe('signature');
    expect(field.rect.page).toBe(0);
    // scale 0.5, so 120 CSS px is 240 PDF units.
    expect(field.rect.width).toBeCloseTo(240, 5);
    expect(field.rect.height).toBeCloseTo(80, 5);
    expect(field.rect.x).toBeCloseTo(112, 5);
  });

  it('measures y up from the bottom of the page, not down from the top', () => {
    drag(10, 20, 100, 60);

    // Drawn 20 CSS px from the top at scale 0.5 → 40 PDF units down, and the
    // box is 120 units tall, so its bottom edge is 842 − 40 − 120 = 682.
    expect(component.fields[0].rect.y).toBeCloseTo(682, 5);
  });

  it('puts a box drawn near the top of the page high in PDF space', () => {
    drag(10, 5, 60, 30);
    const near = component.fields[0].rect.y;
    drag(200, 700, 60, 30);
    const far = component.fields[1].rect.y;

    expect(near)
      .withContext('a field drawn at the top must have a larger y than one at the bottom')
      .toBeGreaterThan(far);
  });

  it('treats a drag too small to be a box as a click', () => {
    drag(40, 40, 90, 40);
    expect(component.fields.length).toBe(1);
    expect(component.selectedId).toBe(component.fields[0].id);

    drag(300, 300, 2, 2);
    expect(component.fields.length).withContext('no field for a stray click').toBe(1);
    expect(component.selectedId).withContext('clicking empty page deselects').toBeNull();
  });

  it('selects an existing field instead of drawing over it', () => {
    drag(40, 40, 100, 50);
    const first = component.fields[0].id;
    component.selectedId = null;

    drag(60, 55, 20, 20); // starts inside the field just placed
    expect(component.fields.length).toBe(1);
    // Compared rather than matched: clearing selectedId above narrows its type
    // to null, and the whole point of the spec is that the drag changed it.
    expect(component.selectedId === first).withContext('the existing field is selected').toBeTrue();
  });

  it('gives each field a distinct key', () => {
    component.kind = 'text';
    drag(20, 20, 80, 30);
    drag(20, 120, 80, 30);
    drag(20, 220, 80, 30);

    const ids = component.fields.map((f) => f.id);
    expect(new Set(ids).size).withContext(ids.join(', ')).toBe(3);
  });

  it('refuses to rename a field onto a key already in use', () => {
    drag(20, 20, 80, 30);
    drag(20, 120, 80, 30);
    const [a, b] = component.fields;

    const originalId = b.id;
    component.rename(b, a.id);
    expect(component.fields[1].id).withContext('the rename must not go through').toBe(originalId);
  });

  it('reverts back to what was last saved', () => {
    drag(20, 20, 80, 30);
    expect(component.dirty).toBeTrue();

    component.revert();
    expect(component.fields.length).toBe(0);
    expect(component.dirty).toBeFalse();
  });

  it('sends the placed fields to the backend', async () => {
    component.kind = 'date';
    drag(20, 20, 80, 30);
    await component.save();

    expect(saved).not.toBeNull();
    expect(saved!.fields.length).toBe(1);
    expect(component.dirty).withContext('saving clears the unsaved marker').toBeFalse();
    expect(component.definition?.version).toBe('1.1.0');
  });

  it('keeps the work when the backend rejects it', async () => {
    (window.fetch as jasmine.Spy).and.returnValue(
      reply({ error: 'fields[0].rect extends past the page' }, 400)
    );
    drag(20, 20, 80, 30);
    await component.save();

    expect(component.fields.length).withContext('a rejected save must not discard the fields').toBe(1);
    expect(component.dirty).toBeTrue();
  });
});
