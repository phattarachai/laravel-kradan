<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticateToken
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($this->accepts((string) $request->bearerToken()), 401);

        return $next($request);
    }

    private function accepts(string $token): bool
    {
        if ($token === '') {
            return false;
        }

        $hash = hash('sha256', $token);

        return collect((array) config('kradan.tokens', []))
            ->contains(fn (mixed $accepted): bool => is_string($accepted) && hash_equals(strtolower(trim($accepted)), $hash));
    }
}
