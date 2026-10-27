<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Kradan;
use Symfony\Component\HttpFoundation\Response;

/**
 * Appended by the service provider, so editing `kradan.middleware` can never
 * drop it. It lets in anyone the host's callback allows to view; routes that
 * change a board's status also check `manage`.
 */
final class Authorize
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = Kradan::user();

        if (Kradan::allows($user, Ability::View)) {
            return $next($request);
        }

        if ($user === null && ! $request->expectsJson() && $this->loginUrl() !== null) {
            return redirect()->guest((string) $this->loginUrl());
        }

        abort(403);
    }

    private function loginUrl(): ?string
    {
        $target = config('kradan.redirect_guests_to');

        if (! is_string($target) || $target === '') {
            return null;
        }

        if (Route::has($target)) {
            return route($target);
        }

        return str_contains($target, '/') ? url($target) : null;
    }
}
