import { handleUpload } from '@vercel/blob/client';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

const KINDS = {
  signature: { allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 3 * 1024 * 1024 },
  report: {
    allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    maxSize: 15 * 1024 * 1024,
  },
};

// Client-upload flow: the browser talks to Vercel Blob directly (no server body-size limit),
// but only after this route — which the signed-in user must reach — hands out a scoped token.
export const requestUploadToken = asyncHandler(async (req, res) => {
  const jsonResponse = await handleUpload({
    body: req.body,
    request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      let parsed = {};
      try {
        parsed = clientPayload ? JSON.parse(clientPayload) : {};
      } catch {
        parsed = {};
      }
      const config = KINDS[parsed.kind];
      if (!config) throw new HttpError(400, 'Unsupported upload type');

      return {
        allowedContentTypes: config.allowedContentTypes,
        maximumSizeInBytes: config.maxSize,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: String(req.user._id), kind: parsed.kind }),
      };
    },
    onUploadCompleted: async () => {
      // Nothing to do server-side: the client saves the returned URL onto the
      // record (signature on the profile, fileUrl on the report) itself.
    },
  });

  res.json(jsonResponse);
});