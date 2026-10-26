import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, installFakeXhr, makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const admin = makeUser({ id: '0190a1b2-c3d4-7000-8000-0000000000aa', email: 'guru@example.com', displayName: 'Guru Admin', role: 'admin', twoFactorEnabled: true });
const restore = { 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(admin) };
const ID = '0190a1b2-c3d4-7000-8000-00000000e001';
const image = (over: Record<string, unknown> = {}) => ({
  id: ID,
  kind: 'image',
  status: 'ready',
  altText: 'Child’s pose on a mat',
  width: 2400,
  height: 1600,
  sizeBytes: 812_000,
  originalName: 'IMG_2041.jpg',
  placeholder: 'data:image/webp;base64,UklGRg==',
  variants: [480, 960, 1600].map((w) => ({ width: w, height: Math.round((w * 2) / 3), url: `/media/i/${ID}/${w}` })),
  createdAt: '2026-10-26T10:00:00Z',
  ...over,
});
const page = (items: unknown[]) => ({ body: { items, page: 1, pageSize: 24, total: items.length } });
const jpeg = (name = 'sunrise.jpg', type = 'image/jpeg') => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type });
const fileInput = () => screen.getByTestId('media-file-input');

describe('admin media library', () => {
  it('shows images at web sizes over a blurred placeholder, and flags missing alt text', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/media': page([image(), image({ id: 'e2', altText: '', originalName: 'logo.png' })]) });
    renderApp('/admin/media');
    const grid = await screen.findByRole('list', { name: 'Images' });
    const [first] = within(grid).getAllByRole('img');
    expect(first).toHaveAttribute('alt', 'Child’s pose on a mat');
    expect(first).toHaveAttribute('src', `http://localhost:5000/api/v1/media/i/${ID}/480`);
    expect(first?.getAttribute('srcset')).toContain(`/media/i/${ID}/1600 1600w`);
    expect(first?.parentElement?.style.backgroundImage).toContain('data:image/webp;base64');
    expect(within(grid).getAllByText('2400 × 1600 · 793 KB')).toHaveLength(2);
    expect(within(grid).getAllByText('Needs alt text')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Media/ })).toHaveAttribute('aria-current', 'page');
  });

  it('uploads a chosen image with progress, then shows it in the library', async () => {
    rememberSignedIn();
    installFakeXhr();
    // The list depends on what has happened, not on call order (StrictMode loads the page twice).
    let uploaded = false;
    const api = mockApi({
      ...restore,
      'GET /admin/media': () => (uploaded ? page([image({ originalName: 'sunrise.jpg' })]) : page([])),
      'POST /admin/media/images': () => {
        uploaded = true;
        return { status: 201, body: { media: image({ originalName: 'sunrise.jpg' }), deduplicated: false } };
      },
    });
    renderApp('/admin/media');
    expect(await screen.findByText('No images yet. Drop your first one above.')).toBeInTheDocument();
    await userEvent.upload(fileInput(), jpeg());
    expect(await screen.findByText('Added to the library.')).toBeInTheDocument();
    const sent = api.callsTo('POST /admin/media/images')[0];
    expect(sent?.headers['Authorization']).toBe(`Bearer token-for-${admin.id}`);
    expect((sent?.body as FormData).get('file')).toBeInstanceOf(File);
    expect(await screen.findByText('sunrise.jpg', { selector: '.media-card__name' })).toBeInTheDocument();
  });

  it('checks files before uploading and names each problem; only good files are sent', async () => {
    rememberSignedIn();
    installFakeXhr();
    const api = mockApi({
      ...restore,
      'GET /admin/media': page([]),
      'POST /admin/media/images': { status: 200, body: { media: image(), deduplicated: true } },
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    const huge = jpeg('huge.jpg');
    Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 });
    const files = [jpeg('IMG_0001.HEIC', ''), jpeg('anim.gif', 'image/gif'), huge, jpeg('fine.jpg')];
    // Dragging and dropping skips the file picker's type filter, so this is where checks matter.
    fireEvent.drop(screen.getByText('Drop images here'), { dataTransfer: { files, types: ['Files'] } });

    const uploads = await screen.findByRole('list', { name: 'Uploads' });
    expect(within(uploads).getByText('“IMG_0001.HEIC” is an iPhone HEIC photo. Export it as JPEG (or set the camera to “Most Compatible”) and upload that.')).toBeInTheDocument();
    expect(within(uploads).getByText('“anim.gif” is a GIF. Upload a JPEG, PNG or WebP image instead.')).toBeInTheDocument();
    expect(within(uploads).getByText('“huge.jpg” is 20.0 MB. Images can be up to 15 MB; resize or compress it first.')).toBeInTheDocument();
    expect(await within(uploads).findByText('Already in the library: kept the existing copy.')).toBeInTheDocument();
    expect(api.callsTo('POST /admin/media/images')).toHaveLength(1);
  });

  it('shows the server’s reason when it refuses a file', async () => {
    rememberSignedIn();
    installFakeXhr();
    mockApi({
      ...restore,
      'GET /admin/media': page([]),
      'POST /admin/media/images': apiError(415, 'UNSUPPORTED_FILE_TYPE', 'This file is a PDF. Upload a JPEG, PNG or WebP image instead.'),
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    await userEvent.upload(fileInput(), jpeg('scan.jpg'));
    const reason = 'This file is a PDF. Upload a JPEG, PNG or WebP image instead.';
    const uploads = await screen.findByRole('list', { name: 'Uploads' });
    expect(await within(uploads).findByText(reason)).toBeInTheDocument();
    // Screen readers hear it too, through the page's live region.
    expect(screen.getByTestId('media-announcer')).toHaveTextContent(`scan.jpg: ${reason}`);
  });

  it('saves alt text and clears the warning', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/media': page([image({ altText: '' })]),
      [`PATCH /admin/media/${ID}`]: { body: { media: image({ altText: 'Sunrise over the ghats' }) } },
    });
    renderApp('/admin/media');
    expect(await screen.findByText('Needs alt text')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save alt text' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Alt text'), 'Sunrise over the ghats');
    await userEvent.click(screen.getByRole('button', { name: 'Save alt text' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Alt text saved.');
    expect(screen.getByTestId('media-announcer')).toHaveTextContent('Alt text saved.');
    expect(api.callsTo(`PATCH /admin/media/${ID}`)[0]?.body).toEqual({ altText: 'Sunrise over the ghats' });
    expect(screen.queryByText('Needs alt text')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save alt text' })).not.toBeInTheDocument();
  });

  it('asks before deleting, explains when an image is still in use, and deletes when it is not', async () => {
    rememberSignedIn();
    let deleted = false;
    const api = mockApi({
      ...restore,
      'GET /admin/media': () => (deleted ? page([]) : page([image()])),
      [`DELETE /admin/media/${ID}`]: [
        apiError(409, 'MEDIA_IN_USE', 'This file is used by 2 articles. Remove it from them first.'),
        () => {
          deleted = true;
          return { status: 204 };
        },
      ],
    });
    renderApp('/admin/media');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete IMG_2041.jpg' }));
    expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('This file is used by 2 articles. Remove it from them first.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete IMG_2041.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('status')).toHaveTextContent('“IMG_2041.jpg” was deleted.');
    await waitFor(() => {
      expect(api.callsTo(`DELETE /admin/media/${ID}`)).toHaveLength(2);
    });
    expect(await screen.findByText('No images yet. Drop your first one above.')).toBeInTheDocument();
  });
});

describe('admin media library: hardening (found in review)', () => {
  it('refreshes an expired session mid-upload and re-sends the same file with the new token', async () => {
    rememberSignedIn();
    installFakeXhr();
    let refreshes = 0;
    const api = mockApi({
      'GET /auth/csrf': { body: { csrfToken: 'c' } },
      'POST /auth/refresh': () => {
        refreshes += 1;
        return { body: { accessToken: `token-${String(refreshes)}`, user: admin } };
      },
      'GET /admin/media': page([]),
      'POST /admin/media/images': [apiError(401, 'TOKEN_EXPIRED', 'Your session expired'), { status: 201, body: { media: image(), deduplicated: false } }],
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    const file = jpeg('sunrise.jpg');
    await userEvent.upload(fileInput(), file);
    expect(await screen.findByText('Added to the library.')).toBeInTheDocument();
    const [first, second] = api.callsTo('POST /admin/media/images');
    expect(second?.headers['Authorization']).not.toBe(first?.headers['Authorization']);
    expect((second?.body as FormData).get('file')).toBe(file);
  });

  it('says the upload stopped part-way (not "check your internet") when the connection drops mid-upload', async () => {
    rememberSignedIn();
    installFakeXhr();
    mockApi({
      ...restore,
      'GET /admin/media': page([]),
      'POST /admin/media/images': () => {
        throw new TypeError('connection reset');
      },
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    await userEvent.upload(fileInput(), jpeg('big.jpg'));
    expect(
      await screen.findByText('The upload stopped before it finished. The file may be too large for the server, or the connection too slow. Try a smaller image.'),
    ).toBeInTheDocument();
  });

  it('stops the rest of a batch when the upload limit is reached, and says why', async () => {
    rememberSignedIn();
    installFakeXhr();
    const api = mockApi({
      ...restore,
      'GET /admin/media': page([]),
      'POST /admin/media/images': apiError(429, 'UPLOAD_LIMIT', 'You’ve uploaded 60 files in the last hour, the most allowed. Please wait a while and try again.'),
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    await userEvent.upload(fileInput(), [jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    const uploads = await screen.findByRole('list', { name: 'Uploads' });
    await waitFor(() => {
      expect(within(uploads).getAllByText(/^Not sent\. You’ve uploaded 60 files/)).toHaveLength(2);
    });
    expect(api.callsTo('POST /admin/media/images')).toHaveLength(1);
  });

  it('adds a second drop to the queue while the first is uploading, keeping the first batch visible', async () => {
    rememberSignedIn();
    installFakeXhr();
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const api = mockApi({
      ...restore,
      'GET /admin/media': page([]),
      'POST /admin/media/images': async () => {
        await held;
        return { status: 201, body: { media: image(), deduplicated: false } };
      },
    });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    await userEvent.upload(fileInput(), jpeg('first.jpg'));
    await screen.findByText(/Optimising/);
    fireEvent.drop(screen.getByText('Drop images here'), { dataTransfer: { files: [jpeg('second.jpg')], types: ['Files'] } });
    const uploads = screen.getByRole('list', { name: 'Uploads' });
    expect(within(uploads).getByText('first.jpg')).toBeInTheDocument();
    expect(within(uploads).getByText('second.jpg')).toBeInTheDocument();
    release();
    await waitFor(() => {
      expect(within(uploads).getAllByText('Added to the library.')).toHaveLength(2);
    });
    expect(api.callsTo('POST /admin/media/images')).toHaveLength(2);
  });

  it('keeps a file dropped outside the drop area from opening in the browser (and leaving the page)', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/media': page([]) });
    renderApp('/admin/media');
    await screen.findByText('No images yet. Drop your first one above.');
    const notCancelled = fireEvent.drop(document.body, { dataTransfer: { files: [jpeg()], types: ['Files'] } });
    expect(notCancelled).toBe(false);
  });

  it('checks files against the server’s own size limit', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/media': { body: { items: [], page: 1, pageSize: 24, total: 0, limits: { maxImageMb: 2 } } } });
    renderApp('/admin/media');
    expect(await screen.findByText(/up to 2 MB each/)).toBeInTheDocument();
    const big = jpeg('three.jpg');
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    fireEvent.drop(screen.getByText('Drop images here'), { dataTransfer: { files: [big], types: ['Files'] } });
    expect(await screen.findByText('“three.jpg” is 3.0 MB. Images can be up to 2 MB; resize or compress it first.')).toBeInTheDocument();
  });

  it('keeps unsaved alt text on other cards when the library reloads after a delete', async () => {
    rememberSignedIn();
    const second = image({ id: 'e2', originalName: 'lotus.jpg', altText: '' });
    let deleted = false;
    mockApi({
      ...restore,
      'GET /admin/media': () => (deleted ? page([second]) : page([image(), second])),
      [`DELETE /admin/media/${ID}`]: () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp('/admin/media');
    const lotusCard = (await screen.findByText('lotus.jpg', { selector: '.media-card__name' })).closest('li');
    if (!lotusCard) throw new Error('lotus card not found');
    await userEvent.type(within(lotusCard).getByLabelText('Alt text'), 'Lotus in bloom');
    await userEvent.click(screen.getByRole('button', { name: 'Delete IMG_2041.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Delete IMG_2041.jpg' })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Alt text')).toHaveValue('Lotus in bloom');
    await waitFor(() => {
      expect(screen.getByRole('status').parentElement).toHaveFocus();
    });
  });

  it('returns focus to the Delete button when the admin chooses Keep', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/media': page([image()]) });
    renderApp('/admin/media');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete IMG_2041.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'Delete IMG_2041.jpg' })).toHaveFocus();
  });

  it('goes back a page when the last image on a later page is deleted', async () => {
    rememberSignedIn();
    const many = Array.from({ length: 24 }, (_, i) => image({ id: `p1-${String(i)}`, originalName: `p1-${String(i)}.jpg` }));
    let deleted = false;
    mockApi({
      ...restore,
      'GET /admin/media': (call) => {
        const total = deleted ? 24 : 25;
        if (!call.path.includes('page=2')) return { body: { items: many, page: 1, pageSize: 24, total } };
        return { body: { items: deleted ? [] : [image({ originalName: 'last.jpg' })], page: 2, pageSize: 24, total } };
      },
      [`DELETE /admin/media/${ID}`]: () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp('/admin/media');
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete last.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('button', { name: 'Delete p1-0.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument(); // one page left: no pager
  });
});
