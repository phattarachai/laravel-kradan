<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\ShareController;

Route::get('p/{token}', ShareController::class)
    ->where('token', '[A-Za-z0-9]{20,128}')
    ->name('share');
