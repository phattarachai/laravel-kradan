<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Http\Requests\ShareRequest;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Share;
use Phattarachai\Kradan\Support\ShareLinks;

/**
 * The board's ลิงก์สาธารณะ menu: people with `manage` list, make and revoke a deck's public links.
 */
final readonly class ShareController
{
    use ResolvesBoards;

    public function __construct(private ShareLinks $links) {}

    public function index(string $slug): JsonResponse
    {
        return response()->json(['shares' => $this->links->list($this->findBoard($slug, Ability::Manage))]);
    }

    public function store(ShareRequest $request, string $slug): JsonResponse
    {
        $made = $this->links->create($this->findBoard($slug, Ability::Manage), $request->roundNumber(), $request->days(), $this->userId());

        return response()->json(['share' => $this->links->present($made['share'], $made['token'])], 201);
    }

    public function destroy(int $share): JsonResponse
    {
        abort_unless(Kradan::allows($this->user(), Ability::Manage), 403);

        return response()->json(['share' => $this->links->present($this->links->revoke(Share::query()->findOrFail($share)))]);
    }
}
