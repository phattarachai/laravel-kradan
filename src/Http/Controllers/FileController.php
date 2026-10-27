<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Illuminate\Http\Response;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Support\ContentSigner;
use Phattarachai\Kradan\Support\RoundPublisher;
use Symfony\Component\HttpFoundation\HeaderUtils;

/**
 * Serves what users uploaded to a board. Stateless and signed like round
 * content. An image is shown sandboxed; anything else only ever downloads,
 * so no upload runs as active content on the app's origin.
 */
final readonly class FileController
{
    public function __construct(private ContentSigner $signer) {}

    public function __invoke(int $item, int $expires, string $signature): Response
    {
        $model = $this->signer->validFile($item, $expires, $signature) ? Item::query()->find($item) : null;
        $disk = RoundPublisher::disk();

        if (! $model instanceof Item || $model->file_path === null || ! $disk->exists($model->file_path)) {
            return $this->respond('Not found', 404, ['Content-Type' => 'text/plain; charset=utf-8']);
        }

        return $this->respond((string) $disk->get($model->file_path), 200, $this->headers($model));
    }

    /**
     * @return array<string, string>
     */
    private function headers(Item $item): array
    {
        $name = (string) $item->file_name;
        $fallback = (string) preg_replace('/[^\x20-\x7e]|[\/\\\\"%]/', '_', $name);
        $disposition = HeaderUtils::makeDisposition($item->isImage() ? 'inline' : 'attachment', $name, $fallback ?: 'file');

        return [
            'Content-Type' => $item->isImage() ? (string) $item->file_type : ($item->file_type ?: 'application/octet-stream'),
            'Content-Disposition' => $disposition,
            'Cache-Control' => 'private, max-age=300',
        ];
    }

    /**
     * @param  array<string, string>  $headers
     */
    private function respond(string $body, int $status, array $headers): Response
    {
        return response($body, $status, [
            ...$headers,
            'Content-Security-Policy' => 'sandbox',
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
        ]);
    }
}
